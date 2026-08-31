/**
 * background.js — Manifest V3 service worker.
 *
 * Receives SAVE_RECORD messages from content.js and persists them in
 * chrome.storage.local under the key "solves".
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[LeetCode Tracker BG] Message received:", message);

  if (message.type === "SAVE_RECORD") {
    const record = message.record;
    console.log("[LeetCode Tracker BG] Saving record:", record);

    chrome.storage.local.get({ solves: [] }, (data) => {
      if (chrome.runtime.lastError) {
        console.error("[LeetCode Tracker BG] Storage read error:", chrome.runtime.lastError);
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      const solves = data.solves;

      solves.push(record);

      chrome.storage.local.set({ solves }, () => {
        if (chrome.runtime.lastError) {
          console.error("[LeetCode Tracker BG] Storage write error:", chrome.runtime.lastError);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          console.log("[LeetCode Tracker BG] Storage written successfully. Total solves:", solves.length);
          sendResponse({ ok: true, totalSolves: solves.length });
        }
      });
    });

    // Return true to indicate async response (MV3 pattern)
    return true;
  }

  // For DATASET_LOADED, CURRENT_PROBLEM_UPDATED — no action needed,
  // just let the popup listen directly via chrome.runtime.onMessage
});
