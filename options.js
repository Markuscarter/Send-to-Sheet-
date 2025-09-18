const wh = document.getElementById("wh");
const toast = document.getElementById("toast");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");

function show(msg, ok = true) {
  toast.textContent = msg;
  toast.className = ok ? "ok" : "err";
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

getStorage(["webhookUrl"], ({ webhookUrl }) => {
  if (webhookUrl) wh.value = webhookUrl;
});

saveBtn.addEventListener("click", () => {
  const url = (wh.value || "").trim();
  if (!valid(url)) return show("Invalid webhook. Must be a Google Apps Script /exec URL.", false);
  setStorage({ webhookUrl: url }, () => show("Saved ✓", true));
});

testBtn.addEventListener("click", async () => {
  const url = (wh.value || "").trim();
  if (!valid(url)) return show("Set a valid webhook first.", false);
  try {
    await fetch(url + "?data=" + encodeURIComponent("send-to-sheet: test"), { method: "GET", mode: "no-cors" });
    show("Test fired (check your Sheet).", true);
  } catch (e) {
    show("Test failed: " + e, false);
  }
});
