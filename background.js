// OAuth and API configuration
let authToken = null;
let tokenExpiryTime = 0;

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  createMenus();
  chrome.alarms.create('syncCounter', { periodInMinutes: 5 });
  chrome.alarms.create('retryQueue', { periodInMinutes: 1 });
  updateBadgeFromSheet();
  migrateFromWebhook();
});

chrome.runtime.onStartup.addListener(() => {
  createMenus();
  updateBadgeFromSheet();
  processOfflineQueue();
});

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ 
      id: "send-to-sheet", 
      title: "Send to Google Sheet", 
      contexts: ["all"] 
    });
  });
}

// OAuth Token Management
async function getAuthToken(interactive = true) {
  const now = Date.now();
  
  // Return cached token if still valid
  if (authToken && tokenExpiryTime > now + 60000) {
    return authToken;
  }
  
  try {
    return await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          authToken = token;
          tokenExpiryTime = now + 3600000; // 1 hour
          resolve(token);
        }
      });
    });
  } catch (error) {
    console.error('Auth failed:', error);
    if (error.message.includes('OAuth2')) {
      // Clear cached token and retry
      chrome.identity.removeCachedAuthToken({ token: authToken }, () => {
        authToken = null;
        tokenExpiryTime = 0;
      });
    }
    throw error;
  }
}

// Parse Sheet ID from URL
function parseSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Escape sheet name for A1 notation
function escapeSheetName(name) {
  return name.replace(/'/g, "''");
}

// Get today's date key
function getTodayKey() {
  return new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  });
}

// Fetch count from Sheet
async function getTodayCountFromSheet() {
  try {
    const token = await getAuthToken(false);
    const { sheetUrl, tabName } = await chrome.storage.sync.get(['sheetUrl', 'tabName']);
    
    if (!sheetUrl) return 0;
    
    const sheetId = parseSheetId(sheetUrl);
    if (!sheetId) return 0;
    
    const range = `'${escapeSheetName(tabName || 'Production Tracker')}'!A:A`;
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    
    if (!response.ok) return 0;
    
    const data = await response.json();
    const values = data.values || [];
    
    const today = getTodayKey();
    let count = 0;
    
    // Count from bottom up for efficiency
    for (let i = values.length - 1; i >= 0 && i >= values.length - 100; i--) {
      if (values[i][0] === today) {
        count++;
      } else if (count > 0) {
        break; // Stop when we've passed today's entries
      }
    }
    
    return count;
  } catch (error) {
    console.error('Failed to fetch count:', error);
    const cached = await chrome.storage.local.get([getTodayKey()]);
    return cached[getTodayKey()] || 0;
  }
}

// Update badge from Sheet
async function updateBadgeFromSheet(force = false) {
  const count = await getTodayCountFromSheet();
  chrome.action.setBadgeText({ text: count.toString() });
  chrome.action.setBadgeBackgroundColor({ color: '#4285f4' });
  chrome.action.setTitle({ title: `Click to save current URL | Cases today: ${count}` });
  
  // Cache locally
  await chrome.storage.local.set({ [getTodayKey()]: count });
}

// Main send function
async function sendToSheet(payload, source = "unknown") {
  const { sheetUrl, tabName } = await chrome.storage.sync.get(['sheetUrl', 'tabName']);
  
  if (!sheetUrl) {
    chrome.runtime.openOptionsPage();
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Setup Required',
      message: 'Please configure your Google Sheet URL'
    });
    return false;
  }
  
  const sheetId = parseSheetId(sheetUrl);
  if (!sheetId) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Invalid Sheet URL',
      message: 'Please check your Sheet URL in options'
    });
    return false;
  }
  
  try {
    const token = await getAuthToken();
    const actualTabName = tabName || 'Production Tracker';
    const range = `'${escapeSheetName(actualTabName)}'!A:B`;
    
    // Format date and hyperlink
    const dateStr = getTodayKey();
    const hyperlinkFormula = `=HYPERLINK("${payload}","${payload}")`;
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?` +
      `valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [[dateStr, hyperlinkFormula]]
        })
      }
    );
    
    if (response.ok) {
      // Optimistic update
      const currentCount = await chrome.storage.local.get([getTodayKey()]);
      const newCount = (currentCount[getTodayKey()] || 0) + 1;
      
      chrome.action.setBadgeText({ text: newCount.toString() });
      chrome.action.setTitle({ title: `Click to save current URL | Cases today: ${newCount}` });
      await chrome.storage.local.set({ [getTodayKey()]: newCount });
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Saved',
        message: `Saved via ${source} (${newCount} cases today)`,
        silent: true
      });
      
      // Schedule accurate sync
      setTimeout(() => updateBadgeFromSheet(), 3000);
      return true;
      
    } else {
      const error = await response.json();
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }
    
  } catch (error) {
    console.error('Send failed:', error);
    
    // Handle auth errors
    if (error.message.includes('401') || error.message.includes('auth')) {
      chrome.identity.removeCachedAuthToken({ token: authToken }, () => {
        authToken = null;
        tokenExpiryTime = 0;
      });
    }
    
    // Add to offline queue
    await addToOfflineQueue(payload, source);
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Queued',
      message: 'Will retry when connection restored'
    });
    
    return false;
  }
}

// Offline Queue Management
async function addToOfflineQueue(payload, source) {
  const { pendingQueue = [] } = await chrome.storage.local.get(['pendingQueue']);
  pendingQueue.push({
    payload,
    source,
    timestamp: Date.now()
  });
  
  // Keep only last 50 items
  if (pendingQueue.length > 50) {
    pendingQueue.shift();
  }
  
  await chrome.storage.local.set({ pendingQueue });
}

async function processOfflineQueue() {
  const { pendingQueue = [] } = await chrome.storage.local.get(['pendingQueue']);
  if (pendingQueue.length === 0) return;
  
  const failed = [];
  
  for (const item of pendingQueue) {
    const success = await sendToSheet(item.payload, item.source + ' (retry)');
    if (!success) {
      failed.push(item);
    }
  }
  
  // Keep only failed items
  await chrome.storage.local.set({ pendingQueue: failed });
}

// Context menu handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const payload = info.linkUrl || 
                 (info.selectionText ? info.selectionText.trim() : '') ||
                 info.pageUrl || 
                 (tab && tab.url) || 
                 '';
  
  if (payload) {
    await sendToSheet(payload, 'right-click');
  }
});

// Keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (command === 'save-selection') {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelection' });
      if (response && response.selection) {
        await sendToSheet(response.selection, 'Ctrl+I');
      } else {
        await sendToSheet(tab.url, 'Ctrl+I');
      }
    } catch {
      await sendToSheet(tab.url, 'Ctrl+I');
    }
  } else if (command === 'save-current-url') {
    await sendToSheet(tab.url, 'Ctrl+Shift+I');
  }
});

// Extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.url) {
    await sendToSheet(tab.url, 'icon click');
  }
});

// Message handler for content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveToSheet') {
    sendToSheet(request.url, 'floating button').then(sendResponse);
    return true;
  }
});

// Periodic tasks
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncCounter') {
    await updateBadgeFromSheet();
  } else if (alarm.name === 'retryQueue') {
    await processOfflineQueue();
  }
});

// Migration helper
async function migrateFromWebhook() {
  const { webhookUrl, migrated } = await chrome.storage.sync.get(['webhookUrl', 'migrated']);
  
  if (webhookUrl && !migrated) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Migration Available',
      message: 'Update to direct Google Sheets integration in options'
    });
    await chrome.storage.sync.set({ migrated: true });
  }
}