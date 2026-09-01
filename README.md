# LeetCode Tracker Chrome Extension

> ⚠️ **Note:** This extension is currently in **beta testing**. You might encounter some bugs or edge cases. Feedback and contributions are welcome!

A lightweight Chrome extension that automatically tracks your LeetCode solve time and difficulty breakdown, and shows which companies ask which questions!

## 📥 How to Install

Since this extension is not on the Chrome Web Store, you can install it manually in a few easy steps:

1. **Download the Extension:** Go to the **Releases** section on the right side of this GitHub page and download the `LeetCode-Tracker.zip` file from the latest release.
2. **Extract the ZIP:** Extract the downloaded `.zip` file into a new folder on your computer.
3. **Open Extensions in Chrome:** Open Google Chrome and go to `chrome://extensions/` in your address bar.
4. **Enable Developer Mode:** Turn on the **Developer mode** toggle in the top-right corner.
5. **Load the Extension:** Click the **Load unpacked** button in the top-left corner.
6. **Select the Folder:** Select the folder where you extracted the extension.

🎉 **That's it!** The LeetCode Tracker icon will appear in your toolbar. 
> **Tip:** Click the puzzle piece icon in Chrome and "Pin" the extension to your toolbar for easy access!

---

## 🏢 Company Dataset (`companyData.json`)

### Where it comes from
The dataset is sourced from community-maintained LeetCode company question lists. **It is NOT live data from LeetCode** — it's a static snapshot containing over 1,200 problems and 15 major tech companies.

### How auto-tagging works
1. `content.js` extracts the slug from the URL (e.g., `/problems/two-sum/` → `two-sum`).
2. When a solve is accepted, the slug is looked up in the dataset and matching companies are attached to your record.
3. If no match is found, it will say "No company data" — you can still manually tag companies in the popup.

### How to refresh the dataset
Replace the CSV file with a newer version and run `node build-company-data.js` to rebuild the dataset, then reload the extension at `chrome://extensions`.

---

## 📁 File Structure

```
leetcode-tracker/
├── manifest.json      # Extension manifest (MV3)
├── content.js         # Injected into LeetCode problem pages
├── background.js      # Service worker — receives records and writes to storage
├── popup.html         # Extension popup UI (markup)
├── popup.css          # Popup styles (editorial light theme)
├── popup.js           # Popup logic — reads storage, renders stats + tags
├── companyData.json   # Bundled dataset (used by content script)
├── companyData.js     # Bundled dataset (used by popup)
└── README.md          # This file
```


---

## How It Works

### 1. Problem Detection (`content.js`)

When a page matching `https://leetcode.com/problems/*` loads, the content script:

- **Problem name:** Parsed from `document.title` (e.g., `"Two Sum - LeetCode"` → `"Two Sum"`).
- **Difficulty:** Detected via a multi-strategy fallback (see DOM Selectors below).
- **Timer:** `startTime = Date.now()` fires exactly when the problem page loads, measuring your true solve time (reading + thinking + coding).

### 2. MutationObserver for "Accepted" (`content.js`)

LeetCode is a React single-page app — there is **no page reload** when you submit code. The extension uses a `MutationObserver` to detect when the results panel updates. The observer is **only attached after the Submit button is clicked** (or `Ctrl+Enter` is pressed) to save performance.

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
- Last 10 solves (most recent first) with company tags
- Company filter dropdown (filter solves by company)
- Add/remove company tags per solve (manual fallback)
- "Clear Stats" button with a `confirm()` dialog

---

## Storage Schema

All data lives under a single key in `chrome.storage.local`:

```js
{
  "solves": [
    {
      "problemName":      "Two Sum",
      "difficulty":       "Easy",
      "timeSpentSeconds": 342,
      "date":             "2026-08-30T14:22:01.123Z",
      "url":              "https://leetcode.com/problems/two-sum/",
      "slug":             "two-sum",
      "companies":        ["Amazon", "Google", "Microsoft"]
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

3. **Timer accuracy:** The timer starts precisely when the content script initializes upon page load. It gracefully handles SPA navigation between tabs within the same problem (like Description, Solutions, Submissions) without resetting, stopping only when your code is finally "Accepted".

4. **Dataset lookup:** To verify the slug matching is working, open any problem page, run `window.location.pathname.split('/').filter(Boolean)[1]` in the console to get the slug, then check if `companyData.json` has that key.

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
- **Deduplication** — logs every attempt even if the same problem is solved on the same day. Change the dedup logic in `background.js` if needed.
- **SPA navigation** — handled via pushState/popState interception + polling. Timer state is intelligently preserved when navigating within the same problem.
- **Timer tracking** — captures total end-to-end solve time (page load to Accepted), including all failed submission attempts in between.
- **Company dataset** — static snapshot; replace `companyData.json` with a newer version to update.
