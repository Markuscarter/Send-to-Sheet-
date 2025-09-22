// Check auth status
async function checkAuthStatus() {
  try {
    await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error('Not authenticated'));
        } else {
          resolve(token);
        }
      });
    });
    
    document.getElementById('authStatus').textContent = 'Connected to Google Sheets';
    document.getElementById('authStatus').className = 'auth-status connected';
  } catch {
    document.getElementById('authStatus').textContent = 'Not authenticated - click Authenticate to connect';
    document.getElementById('authStatus').className = 'auth-status';
  }
}

// Load settings
chrome.storage.sync.get(['sheetUrl', 'tabName', 'floatingButtonEnabled'], (data) => {
  if (data.sheetUrl) document.getElementById('sheetUrl').value = data.sheetUrl;
  if (data.tabName) document.getElementById('tabName').value = data.tabName;
  document.getElementById('floatingToggle').checked = data.floatingButtonEnabled || false;
});

// Save settings
document.getElementById('save').addEventListener('click', () => {
  const sheetUrl = document.getElementById('sheetUrl').value.trim();
  const tabName = document.getElementById('tabName').value.trim() || 'Production Tracker';
  
  if (!sheetUrl) {
    showStatus('Please enter a Google Sheet URL', false);
    return;
  }
  
  chrome.storage.sync.set({ sheetUrl, tabName }, () => {
    showStatus('Settings saved successfully!', true);
    chrome.runtime.sendMessage({ action: 'updateBadge' });
  });
});

// Authenticate
document.getElementById('auth').addEventListener('click', () => {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError) {
      showStatus('Authentication failed: ' + chrome.runtime.lastError.message, false);
    } else {
      showStatus('Authentication successful!', true);
      checkAuthStatus();
    }
  });
});

// Test connection
document.getElementById('test').addEventListener('click', async () => {
  showStatus('Testing connection...', true);
  
  chrome.runtime.sendMessage({ 
    action: 'saveToSheet', 
    url: 'Test from options: ' + new Date().toLocaleString() 
  }, (response) => {
    if (response) {
      showStatus('Test successful! Check your sheet.', true);
      loadStats();
    } else {
      showStatus('Test failed. Check your settings and authentication.', false);
    }
  });
});

// Floating button toggle
document.getElementById('floatingToggle').addEventListener('change', (e) => {
  chrome.storage.sync.set({ floatingButtonEnabled: e.target.checked });
});

// Sync now
document.getElementById('syncNow').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'syncCounter' });
  setTimeout(loadStats, 1000);
});

// Load stats
async function loadStats() {
  const data = await chrome.storage.local.get(null);
  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  });
  
  const todayCount = data[today] || 0;
  let html = `<p><strong>Today (${today}):</strong> ${todayCount} cases</p>`;
  
  const pending = data.pendingQueue?.length || 0;
  if (pending > 0) {
    html += `<p><strong>Pending uploads:</strong> ${pending}</p>`;
  }
  
  document.getElementById('stats-content').innerHTML = html;
}

function showStatus(message, success) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = success ? 'status success' : 'status error';
  setTimeout(() => {
    status.className = 'status';
  }, 5000);
}

// Initial load
checkAuthStatus();
loadStats();