const DEFAULT_WEBHOOK = ""; // or hardcode your /a/macros/<domain>/.../exec here while testing

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "send-any", title: "Send to Google Sheet", contexts: ["all"] });
  });
}
chrome.runtime.onInstalled.addListener(createMenus);
chrome.runtime.onStartup.addListener(createMenus);

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

async function sendToWebhook(payload) {
  const webhook = await getWebhook();
  if (!webhook) return chrome.runtime.openOptionsPage();

  const sep = webhook.includes("?") ? "&" : "?";
  const url = `${webhook}${sep}data=${encodeURIComponent(payload)}`;
  // IMPORTANT: include Workspace cookies; keep no-cors so CORS headers aren’t required
  try {
    await fetch(url, { method: "GET", mode: "no-cors", credentials: "include" });
    // opaque response is expected; the sheet should still update
  } catch (e) {
    console.error("[Send to Sheet] fetch failed:", e);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const payload =
    info.linkUrl ||
    (info.selectionText ? info.selectionText.trim() : "") ||
    info.pageUrl ||
    (tab && tab.url) ||
    "";
  if (!payload) return;
  await sendToWebhook(payload);
});
