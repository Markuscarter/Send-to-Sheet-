const wh = document.getElementById("wh");
const toast = document.getElementById("toast");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");

function show(msg, ok = true) {
  toast.textContent = msg;
  toast.className = ok ? "ok" : "err";
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

function valid(url) {
  return typeof url === "string" &&
         url.startsWith("https://script.google.com/") &&
         url.includes("/exec");
}

function getStorage(keys, cb) {
  chrome.storage.sync.get(keys, (syncVals) => {
    if (chrome.runtime.lastError || !syncVals.webhookUrl) {
      chrome.storage.local.get(keys, (localVals) => cb(localVals || {}));
    } else {
      cb(syncVals);
    }
  });
}

function setStorage(obj, cb) {
  chrome.storage.sync.set(obj, () => {
    chrome.storage.local.set(obj, cb);
  });
}

// Load webhook URL
getStorage(["webhookUrl"], ({ webhookUrl }) => {
  if (webhookUrl) wh.value = webhookUrl;
});

// Load and display stats
async function loadStats() {
  const allData = await chrome.storage.local.get(null);
  const today = new Date().toLocaleDateString('en-US');
  const todayCount = allData[today] || 0;
  
  let statsHTML = `<div class="stat-row"><strong>Today (${today}):</strong> <span>${todayCount} cases</span></div>`;
  
  // Calculate weekly total
  let weekTotal = 0;
  const last7Days = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = date.toLocaleDateString('en-US');
    const count = allData[dateKey] || 0;
    weekTotal += count;
    if (count > 0 && i > 0) {
      last7Days.push(`<div class="stat-row"><span>${dateKey}:</span> <span>${count} cases</span></div>`);
    }
  }
  
  statsHTML += `<div class="stat-row"><strong>Last 7 days total:</strong> <span>${weekTotal} cases</span></div>`;
  
  if (last7Days.length > 0) {
    statsHTML += '<div style="margin-top: 10px; font-size: 13px; opacity: 0.8;">';
    statsHTML += last7Days.join('');
    statsHTML += '</div>';
  }
  
  document.getElementById('stats-content').innerHTML = statsHTML;
}

loadStats();
// Refresh stats every 30 seconds
setInterval(loadStats, 30000);

saveBtn.addEventListener("click", () => {
  const url = (wh.value || "").trim();
  if (!valid(url)) {
    show("Invalid URL. Must be a Google Apps Script /exec URL.", false);
    return;
  }
  setStorage({ webhookUrl: url }, () => {
    show("Settings saved successfully!", true);
  });
});

testBtn.addEventListener("click", async () => {
  const url = (wh.value || "").trim();
  if (!valid(url)) {
    show("Please enter a valid webhook URL first.", false);
    return;
  }
  
  show("Sending test...", true);
  
  try {
    await fetch(url + "?data=" + encodeURIComponent("Test from extension: " + new Date().toLocaleString()), 
               { method: "GET", mode: "no-cors" });
    show("Test sent! Check your Google Sheet.", true);
    setTimeout(loadStats, 1000);
  } catch (e) {
    show("Test failed: " + e.message, false);
  }
});

// Show/hide toast initially
toast.style.display = "none";

// Load floating button setting
chrome.storage.sync.get(['floatingButtonEnabled'], ({ floatingButtonEnabled }) => {
  document.getElementById('floatingToggle').checked = floatingButtonEnabled || false;
});

// Save floating button setting
document.getElementById('floatingToggle').addEventListener('change', (e) => {
  chrome.storage.sync.set({ floatingButtonEnabled: e.target.checked }, () => {
    show(e.target.checked ? 'Floating button enabled' : 'Floating button disabled', true);
  });
});