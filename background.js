const DEFAULT_WEBHOOK = ""; // Optional: hardcode your webhook URL here

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  createMenus();
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  createMenus();
  updateBadge();
});

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ 
      id: "send-any", 
      title: "Send to Google Sheet", 
      contexts: ["selection", "link", "page", "image"] 
    });
    chrome.contextMenus.create({ 
      id: "send-page-url", 
      title: "Send current page URL", 
      contexts: ["page"] 
    });
  });
}

// FEATURE 1: Daily Counter Functions
function getTodayKey() {
  return new Date().toLocaleDateString('en-US');
}

async function updateBadge() {
  const todayKey = getTodayKey();
  const result = await chrome.storage.local.get([todayKey]);
  const count = result[todayKey] || 0;
  
  chrome.action.setBadgeText({ text: count.toString() });
  chrome.action.setBadgeBackgroundColor({ color: '#4285f4' });
  chrome.action.setTitle({ title: `Click to save current URL | Cases today: ${count}` });
}

async function incrementDailyCount() {
  const todayKey = getTodayKey();
  const result = await chrome.storage.local.get([todayKey]);
  const currentCount = result[todayKey] || 0;
  const newCount = currentCount + 1;
  
  await chrome.storage.local.set({ [todayKey]: newCount });
  
  chrome.action.setBadgeText({ text: newCount.toString() });
  chrome.action.setTitle({ title: `Click to save current URL | Cases today: ${newCount}` });
  
  cleanOldCounts();
}

async function cleanOldCounts() {
  const allData = await chrome.storage.local.get(null);
  const today = new Date();
  const keysToRemove = [];
  
  for (const key in allData) {
    if (key.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
      const keyDate = new Date(key);
      const daysDiff = Math.floor((today - keyDate) / (1000 * 60 * 60 * 24));
      if (daysDiff > 7) {
        keysToRemove.push(key);
      }
    }
  }
  
  if (keysToRemove.length > 0) {
    chrome.storage.local.remove(keysToRemove);
  }
}

// Core webhook functions
function getWebhook() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["webhookUrl"], ({ webhookUrl }) => {
      const v1 = (webhookUrl || "").trim();
      if (v1) return resolve(v1);
      chrome.storage.local.get(["webhookUrl"], ({ webhookUrl: localUrl }) => {
        resolve((localUrl || DEFAULT_WEBHOOK || "").trim());
      });
    });
  });
}

// OPTIMIZED webhook function with timeout
async function sendToWebhook(payload, source = "unknown") {
  const webhook = await getWebhook();
  if (!webhook) {
    chrome.runtime.openOptionsPage();
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "Setup Required",
      message: "Please configure your webhook URL"
    });
    return false;
  }

  const sep = webhook.includes("?") ? "&" : "?";
  const url = `${webhook}${sep}data=${encodeURIComponent(payload)}`;
  
  try {
    // Use AbortController for 3 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    // Try with CORS first for real response
    const response = await fetch(url, { 
      method: "GET", 
      signal: controller.signal,
      mode: "cors",
      credentials: "include"
    }).catch(async (corsError) => {
      // If CORS fails, fallback to no-cors
      clearTimeout(timeoutId);
      const newTimeoutId = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(url, { 
        method: "GET", 
        signal: controller.signal,
        mode: "no-cors",
        credentials: "include"
      });
      clearTimeout(newTimeoutId);
      return resp;
    });
    
    clearTimeout(timeoutId);
    
    // Success - update counter
    await incrementDailyCount();
    const todayKey = getTodayKey();
    const result = await chrome.storage.local.get([todayKey]);
    const count = result[todayKey] || 0;
    
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "Saved",
      message: `Saved via ${source} (${count} cases today)`,
      silent: true
    });
    return true;
    
  } catch (e) {
    if (e.name === 'AbortError') {
      // Timeout after 3 seconds - assume success if your script usually works
      await incrementDailyCount();
      const todayKey = getTodayKey();
      const result = await chrome.storage.local.get([todayKey]);
      const count = result[todayKey] || 0;
      
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "Saved (Slow Response)",
        message: `Likely saved via ${source} (${count} cases today)`,
        silent: true
      });
      console.log("[Send to Sheet] Timed out after 3s, assumed success");
      return true;
    } else {
      // Real error - don't increment counter
      console.error("[Send to Sheet] Failed:", e);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "Error",
        message: "Failed to save to sheet"
      });
      return false;
    }
  }
}

// Context menu handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "send-page-url") {
    if (tab && tab.url) {
      await sendToWebhook(tab.url, "page menu");
    }
  } else {
    const payload =
      info.linkUrl ||
      (info.selectionText ? info.selectionText.trim() : "") ||
      info.srcUrl ||
      info.pageUrl ||
      (tab && tab.url) ||
      "";
    if (!payload) return;
    await sendToWebhook(payload, "right-click");
  }
});

// FEATURE 3 & 4: Keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save-selection") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Try to get selection from content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
      if (response && response.selection) {
        await sendToWebhook(response.selection, "Ctrl+I");
      } else {
        // No selection, save the page URL
        await sendToWebhook(tab.url, "Ctrl+I (page)");
      }
    } catch (e) {
      // Content script not available, save page URL
      await sendToWebhook(tab.url, "Ctrl+I (page)");
    }
  } else if (command === "save-current-url") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      await sendToWebhook(tab.url, "Ctrl+Shift+I");
    }
  }
});

// FEATURE 4: Click extension icon to save current URL
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.url) {
    await sendToWebhook(tab.url, "icon click");
  }
});

// FEATURE 2: Message handler for quick-save button
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveToSheet") {
    sendToWebhook(request.url, "quick button").then(sendResponse);
    return true;
  }
});

// Reset counter at midnight
setInterval(async () => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    await updateBadge();
  }
}, 60000);