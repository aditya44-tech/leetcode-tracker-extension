# LeetCode Tracker — Chrome Extension (Manifest V3)

A lightweight Chrome extension that automatically tracks your LeetCode solve time and difficulty breakdown.

## File Structure

```
leetcode-tracker/
├── manifest.json      # Extension manifest (MV3)
├── content.js         # Injected into LeetCode problem pages
├── background.js      # Service worker — receives records and writes to storage
├── popup.html         # Extension popup UI (markup)
├── popup.css          # Popup styles (dark theme)
├── popup.js           # Popup logic — reads storage, renders stats
└── README.md          # This file
```

> **Note:** The manifest references icon files (`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`). You can create simple PNG icons or remove the `icons` key from `manifest.json` — Chrome will use a default puzzle-piece icon.

---

## How It Works

### 1. Problem Detection (`content.js`)

When a page matching `https://leetcode.com/problems/*` loads, the content script:

- **Problem name:** Parsed from `document.title` (e.g., `"Two Sum - LeetCode"` → `"Two Sum"`).
- **Difficulty:** Detected via a multi-strategy fallback (see DOM Selectors below).
- **Timer:** `startTime = Date.now()` fires immediately after detection.

### 2. MutationObserver for "Accepted" (`content.js`)

LeetCode is a React single-page app — there is **no page reload** when you submit code. The extension uses a `MutationObserver` attached to `document.body` to detect when the results panel updates.

```
MutationObserver observes:
  target:  document.body
  config:  { childList: true, subtree: true, characterData: true }
  handler: debounced check for "Accepted" text (600ms debounce)
```

**How it finds the result panel:**
1. Checks for known `data-*` attributes (`data-e2e-locator="submission-result"`, etc.)
2. Falls back to a TreeWalker scan for a text node whose content starts with `"Accepted"`
3. Uses the nearest ancestor `<div>` as the result container

When "Accepted" is found:
- Calculates `timeSpentSeconds = (Date.now() - startTime) / 1000`
- Sends a `SAVE_RECORD` message to `background.js`
- Disconnects the observer (no double-counting within the same page session)

### 3. Background Service Worker (`background.js`)

Receives `SAVE_RECORD` messages and appends them to `chrome.storage.local`.

### 4. Popup UI (`popup.html` / `popup.css` / `popup.js`)

Reads from `chrome.storage.local` on open and displays:
- Total problems solved
- Breakdown by difficulty (Easy / Medium / Hard)
- Average solve time per difficulty
- Last 10 solves (most recent first)
- "Clear Stats" button with a `confirm()` dialog

---

## Storage Schema

All data lives under a single key in `chrome.storage.local`:

```js
{
  "solves": [
    {
      "problemName":      "Two Sum",           // string
      "difficulty":       "Easy",               // "Easy" | "Medium" | "Hard"
      "timeSpentSeconds": 342,                   // number (seconds)
      "date":             "2026-08-30T14:22:01.123Z", // ISO 8601
      "url":              "https://leetcode.com/problems/two-sum/"
    }
  ]
}
```

---

## Loading the Extension (Unpacked)

1. Open `chrome://extensions` in your Chromium browser.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the folder containing this extension's files.
5. The LeetCode Tracker icon will appear in your toolbar.

> **Tip:** After loading, click the extension icon while on a LeetCode problem page to see the popup.

---

## DOM Selectors — What to Watch For

LeetCode obfuscates CSS class names and changes them frequently. This extension **avoids hardcoded class-name selectors** and instead relies on:

| What | How it's detected | Stability | Verify in DevTools |
|---|---|---|---|
| Problem name | `document.title` | ⬛⬛⬛⬛⬛ High — always "Name - LeetCode" | `document.title` |
| Difficulty (primary) | `[data-difficulty]` attribute | ⬛⬛⬛⬛◻ Good if present | Check `<html>` or problem container for `data-difficulty` |
| Difficulty (fallback 1) | Leaf `<span>` whose text is exactly "Easy"/"Medium"/"Hard" inside the title container | ⬛⬛⬛◻◻ Medium — container structure may change | Inspect the `<h1>` area in Elements panel |
| Difficulty (fallback 2) | Page-wide scan of all `<span>`, `<div>`, `<strong>` leaf nodes | ⬛⬛◻◻◻ Lower — may match sidebar items | Search DOM for "Easy" / "Medium" / "Hard" text |
| Difficulty (fallback 3) | `document.title` string match | ⬛⬛⬛⬛◻ Good | `document.title` |
| "Accepted" result | `[data-e2e-locator="submission-result"]` or TreeWalker text scan | ⬛⬛⬛◻◻ Medium — data attributes may change | Submit code, search Elements for "Accepted" |

### ⚠️ Things to verify yourself

1. **Difficulty detection:** Open any problem page, open DevTools Console, and run:
   ```js
   // Check if data-difficulty exists
   document.querySelector("[data-difficulty]")

   // Check what the title looks like
   document.title
   ```

2. **Accepted detection:** Submit an accepted solution, then in DevTools search (Ctrl+F in Elements panel) for the text `Accepted`. Note the nearest `data-*` attribute or stable parent element. If none exists, the TreeWalker fallback will catch it, but you can narrow the observer scope for better performance.

3. **Timer accuracy:** The timer starts when `document_idle` fires (content script loads). LeetCode's SPA navigation may mean the timer starts slightly after the page visually renders. For most problems this is negligible, but very fast solves (<10s) may show slightly inflated times.

---

## Console Logging

Every key step is logged with the prefix `[LeetCode Tracker]` (content script) or `[LeetCode Tracker BG]` (service worker) or `[LeetCode Tracker Popup]` (popup). To debug:

1. Open any LeetCode problem page.
2. Open DevTools → Console.
3. Filter by `LeetCode Tracker`.
4. You should see:
   - `Content script loaded on: …`
   - `Problem detected — "Two Sum" [Easy]`
   - `Timer started at …`
   - `MutationObserver attached — watching for Accepted`
5. After submitting an accepted solution:
   - `Accepted detected — Two Sum (Easy) — 342s`
   - `Sending record to background.js …`
   - (BG) `Message received: …`
   - (BG) `Storage written successfully. Total solves: 1`

---

## Limitations / Future Ideas

- **No problem list tracking** — only individual solves on the problem page.
- **No LeetCode API integration** — purely DOM-based detection.
- **Deduplication** — v1 logs every attempt even if the same problem is solved on the same day (as specified). Change the dedup logic in `background.js` if needed.
- **SPA navigation** — if you navigate between problems without a full page reload, the content script may not re-inject. A future version could use `chrome.webNavigation` events to handle this.
- **Timer precision** — starts at `document_idle`, not when the page visually renders. Good enough for most use cases.
