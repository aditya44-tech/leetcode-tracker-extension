/**
 * background.js — Manifest V3 service worker.
 *
 * Receives SAVE_RECORD messages from content.js and persists them in
 * chrome.storage.local under the key "solves".
 *
 * Storage schema:
 *   chrome.storage.local.get("solves")  →  { solves: SolveRecord[] }
 *
 *   SolveRecord = {
 *     problemName:       string,
 *     difficulty:        "Easy" | "Medium" | "Hard",
 *     timeSpentSeconds:  number,
 *     date:              string (ISO 8601),
 *     url:               string
 *   }
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[LeetCode Tracker BG] Message received:", message);

  if (message.type === "SAVE_RECORD") {
    const record = message.record;
    console.log("[LeetCode Tracker BG] Saving record:", record);

    // Read existing solves, append, write back.
    chrome.storage.local.get({ solves: [] }, (data) => {
      if (chrome.runtime.lastError) {
        console.error("[LeetCode Tracker BG] Storage read error:", chrome.runtime.lastError);
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      const solves = data.solves;

      // Optional dedup: skip if same problemName + same calendar date
      const recordDate = record.date.slice(0, 10); // "2026-08-30"
      const duplicate = solves.some(
        (s) => s.problemName === record.problemName && s.date.slice(0, 10) === recordDate
      );

      if (duplicate) {
        console.log(
          "[LeetCode Tracker BG] Duplicate detected (same problem + same day) — saving anyway per v1 spec."
        );
      }

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

    // Return true to indicate we will respond asynchronously (MV3 pattern).
    return true;
  }
});
