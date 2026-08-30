/**
 * content.js — Injected into LeetCode problem pages.
 *
 * Flow:
 *   1. On page load / SPA navigation → capture problem name + difficulty,
 *      attach a click listener on the Submit button.  NO MutationObserver yet.
 *   2. User clicks Submit → log the click, start timer, attach a
 *      MutationObserver scoped to the result panel only.
 *   3. Result panel updates to "Accepted" → calculate time, save record.
 *   4. SPA navigation away → disconnect observer, reset state, re-attach
 *      submit-button listener for the new problem.
 *
 * DOM selectors are kept intentionally broad (data-* attributes, text
 * matching, closest-container walks).  Every fragile selector is flagged
 * with a comment so you can verify / adjust in DevTools.
 */

(function () {
  "use strict";

  /* --------------------------------------------------------------- */
  /*  State                                                           */
  /* --------------------------------------------------------------- */
  let problemName = null;
  let difficulty  = null;
  let startTime   = null;   // set on submit click, NOT on page load
  let observer    = null;   // MutationObserver instance
  let submitBtnListener = null;
  let alreadyAccepted = false;
  let currentURL  = location.href;
  let companyDataset = null; // loaded from companyData.json

  /* --------------------------------------------------------------- */
  /*  Utilities                                                       */
  /* --------------------------------------------------------------- */
  function log(msg) {
    console.log(`[LeetCode Tracker] ${msg}`);
  }

  /* --------------------------------------------------------------- */
  /*  Problem-name + difficulty detection  (unchanged from v1)        */
  /* --------------------------------------------------------------- */
  function detectProblemName() {
    const raw = document.title || "";
    const name = raw.replace(/\s*-\s*LeetCode\s*$/i, "").trim();
    return name || null;
  }

  function detectDifficulty() {
    const dataEl = document.querySelector("[data-difficulty]");
    if (dataEl) {
      const v = (dataEl.getAttribute("data-difficulty") || "").toLowerCase();
      if (["easy", "medium", "hard"].includes(v))
        return v.charAt(0).toUpperCase() + v.slice(1);
    }

    const titleEl =
      document.querySelector('[data-cy="problem-title"]') ||
      document.querySelector("div[class*='title'] > h1") ||
      document.querySelector("h1");
    if (titleEl) {
      const container = titleEl.closest("div[class]") || titleEl.parentElement;
      if (container) {
        for (const span of container.querySelectorAll("span")) {
          const t = span.textContent.trim();
          if (t === "Easy")  return "Easy";
          if (t === "Medium") return "Medium";
          if (t === "Hard")  return "Hard";
        }
      }
    }

    const all = document.querySelectorAll("span, div, strong, badge, tag");
    for (const el of all) {
      if (el.children.length === 0) {
        const t = el.textContent.trim();
        if (t === "Easy")  return "Easy";
        if (t === "Medium") return "Medium";
        if (t === "Hard")  return "Hard";
      }
    }

    const raw = document.title || "";
    if (/\bEasy\b/i.test(raw))  return "Easy";
    if (/\bMedium\b/i.test(raw)) return "Medium";
    if (/\bHard\b/i.test(raw))  return "Hard";
    return null;
  }

  /* --------------------------------------------------------------- */
  /*  Company dataset lookup                                          */
  /*  ---------------------------------------------------------------
   *  Dataset is loaded once in init(). The lookup happens in
   *  accepted() — right when the record is built.
   *
   *  To verify in DevTools:
   *    1. Navigate to any problem page
   *    2. Run: window.location.pathname.split('/').filter(Boolean)[1]
   *       — this is the slug (e.g. "two-sum")
   *    3. Run: fetch(chrome.runtime.getURL('companyData.json')).then(r=>r.json()).then(d=>console.log(d['two-sum']))
   *       — should print ["Amazon","Google",...]                         */
  function slugFromURL() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    // /problems/two-sum/  →  ["problems","two-sum"]
    return parts.length >= 2 ? parts[1] : null;
  }

  function lookupCompanies(slug) {
    if (!companyDataset || !slug) return [];
    const companies = companyDataset[slug];
    if (companies) {
      log(`Dataset match for "${slug}" → ${JSON.stringify(companies)}`);
      return [...companies]; // copy so we don't mutate the dataset
    }
    log(`No dataset match for "${slug}"`);
    return [];
  }

  /* --------------------------------------------------------------- */
  /*  Submit-button detection                                         */
  /*  ---------------------------------------------------------------
   *  LeetCode renders a "Submit" button in the code-editor toolbar.
   *  ⚠️  VERIFY IN DEVTOOLS: on any problem page, run one of:
   *      document.querySelector('[data-e2e-locator="submit-button"]')
   *      document.querySelector('[data-testid="submit-button"]')
   *      [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit')
   *      — whichever returns the element you see in the UI.           */
  function findSubmitButton() {
    return (
      document.querySelector('[data-e2e-locator="submit-button"]') ||
      document.querySelector('[data-testid="submit-button"]')      ||
      document.querySelector('[data-e2e="submit-btn"]')             ||
      // Fallback: leaf button whose trimmed text is exactly "Submit"
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Submit" && b.offsetParent !== null
      ) ||
      null
    );
  }

  function attachSubmitListener() {
    if (submitBtnListener) return; // already attached

    const btn = findSubmitButton();
    if (!btn) {
      // Button may not exist yet (async render). Retry shortly.
      log("Submit button not found yet — retrying in 2 s");
      setTimeout(attachSubmitListener, 2000);
      return;
    }

    log("Submit button found — attaching click listener");
    submitBtnListener = function on submitClick() {
      log("✅ Submit button clicked — starting timer and attaching observer");

      // Reset state for this submission
      alreadyAccepted = false;
      startTime = Date.now();
      log(`Timer started at ${new Date(startTime).toISOString()}`);

      // Start watching the result panel
      startResultPanelObserver();
    };

    btn.addEventListener("click", submitBtnListener);
  }

  function detachSubmitListener() {
    if (submitBtnListener) {
      const btn = findSubmitButton();
      if (btn) btn.removeEventListener("click", submitBtnListener);
      submitBtnListener = null;
      log("Submit-button listener detached");
    }
  }

  /* --------------------------------------------------------------- */
  /*  Result-panel MutationObserver                                   */
  /*  ---------------------------------------------------------------
   *  Instead of watching the entire document.body, we:
   *    1. Locate the specific result-panel container.
   *    2. Observe ONLY that container (or document.body if we can't
   *       find a stable container — but we only ACCEPT text that
   *       appears inside the result panel, never anywhere else).
   *
   *  The "panel finder" is intentionally NOT a raw body-wide text
   *  search.  It matches a dedicated data-attribute element first,
   *  then falls back to the React-rendered result area that sits
   *  directly after the code-editor panel — never the sidebar,
   *  problem list, or discussion threads.
   *
   *  ⚠️  VERIFY IN DEVTOOLS: submit a solution, then:
   *      1. Search Elements for data-e2e-locator="submission-result"
   *      2. If absent, Ctrl+F in Elements for "Accepted" and note
   *         the NEAREST ancestor with a data-* attribute.            */

  function findResultPanel() {
    // 1 — Dedicated data-attribute elements (most reliable)
    const byData =
      document.querySelector('[data-e2e-locator="submission-result"]') ||
      document.querySelector('[data-testid="run-result-panel"]')      ||
      document.querySelector('[data-e2e="judge-result"]')             ||
      document.querySelector('[data-e2e-locator="run-progress-step"]');

    if (byData) {
      log("Result panel found via data-* attribute");
      return byData;
    }

    // 2 — Heuristic: find the element whose INNER text starts with
    //     "Accepted" or "Wrong Answer" — but only look inside the
    //     main content area (not sidebar / nav).
    //     We scope to the element directly under #editor+ or the
    //     right-hand panel area to avoid false positives.
    const mainArea =
      document.querySelector('[data-layout-path="/problems"]') ||
      document.querySelector('[class*="result"]')              ||
      document.querySelector('[class*="test-result"]')         ||
      document.querySelector('[class*="submission"]')          ||
      document.querySelector('[class*="runtime"]');

    if (mainArea) {
      const walker = document.createTreeWalker(mainArea, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (/^\s*Accepted\b/.test(walker.currentNode.textContent)) {
          const panel = walker.currentNode.parentElement.closest("div");
          log("Result panel found via scoped text search");
          return panel;
        }
      }
    }

    // 3 — Last resort: narrow body search for an element whose
    //     direct text starts with "Accepted" AND whose parent is
    //     not a nav, header, or sidebar.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (/^\s*Accepted\b/.test(node.textContent)) {
        const el = node.parentElement;
        // Reject if the element is inside <nav>, <header>, or
        // elements with sidebar-like roles
        if (el.closest("nav, header, [role='navigation'], [role='banner']")) {
          continue;
        }
        const panel = el.closest("div") || el;
        log("Result panel found via body text search (fallback)");
        return panel;
      }
    }

    return null;
  }

  let debounceTimer = null;

  function checkResultPanel() {
    if (alreadyAccepted || !startTime) return;

    const panel = findResultPanel();
    if (!panel) return;

    const text = panel.textContent;
    log(`Result panel text: "${text.substring(0, 80)}…"`);

    if (/\bAccepted\b/.test(text)) {
      log("🎯 Correct result panel says 'Accepted' — calling accepted()");
      accepted();
    } else if (/\bWrong Answer\b|\bTime Limit Exceeded\b|\bRuntime Error\b|\bCompile Error\b/i.test(text)) {
      log("Result is not Accepted — stopping observer for this attempt");
      stopResultPanelObserver();
    }
  }

  function onMutation() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkResultPanel, 600);
  }

  function startResultPanelObserver() {
    stopResultPanelObserver(); // clean up any previous observer

    const panel = findResultPanel();
    const target = panel || document.body; // observe body as superset if panel not yet rendered

    observer = new MutationObserver(onMutation);
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    log(`MutationObserver attached to ${panel ? "result panel" : "document.body (panel not yet rendered)"} — waiting for result`);
  }

  function stopResultPanelObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
      log("MutationObserver disconnected");
    }
    clearTimeout(debounceTimer);
  }

  /* --------------------------------------------------------------- */
  /*  Accepted handler                                                */
  /* --------------------------------------------------------------- */
  function accepted() {
    if (alreadyAccepted) return;
    alreadyAccepted = true;
    stopResultPanelObserver();

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log(`✅ Accepted — ${problemName} (${difficulty}) — ${elapsed}s`);

    const slug = slugFromURL();
    const companies = lookupCompanies(slug);

    const record = {
      problemName,
      difficulty,
      timeSpentSeconds: elapsed,
      date: new Date().toISOString(),
      url: window.location.href,
      slug,
      companies,
    };

    log("Sending record to background.js …");
    chrome.runtime.sendMessage({ type: "SAVE_RECORD", record }, (resp) => {
      if (chrome.runtime.lastError) {
        log("Error: " + chrome.runtime.lastError.message);
      } else {
        log("Background acknowledged: " + JSON.stringify(resp));
      }
    });
  }

  /* --------------------------------------------------------------- */
  /*  SPA-navigation handling                                         */
  /*  ---------------------------------------------------------------
   *  LeetCode is a React SPA — the page never fully reloads when
   *  you navigate between problems.  We detect URL changes by
   *  polling window.location.href every 1 s and listening for
   *  popstate / pushState / replaceState.
   *
   *  On every URL change we:
   *    1. Disconnect any running MutationObserver.
   *    2. Detach the old submit-button listener.
   *    3. Re-detect problem name + difficulty.
   *    4. Re-attach the submit-button listener.                         */

  function onSPANavigation() {
    const newURL = location.href;
    if (newURL === currentURL) return;

    log(`SPA navigation detected: ${currentURL} → ${newURL}`);
    currentURL = newURL;

    // 1 — Tear down previous state
    stopResultPanelObserver();
    detachSubmitListener();
    alreadyAccepted = false;
    startTime = null;

    // 2 — Detect new problem
    problemName = detectProblemName();
    difficulty  = detectDifficulty();
    log(`New problem — "${problemName}" [${difficulty || "unknown"}]`);

    // 3 — Re-attach submit listener
    attachSubmitListener();
  }

  // Listen for popstate (back/forward)
  window.addEventListener("popstate", onSPANavigation);

  // Intercept pushState / replaceState (programmatic navigation)
  const origPush    = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    origPush.apply(this, args);
    // Small delay to let React update the DOM after pushState
    setTimeout(onSPANavigation, 100);
  };
  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    setTimeout(onSPANavigation, 100);
  };

  // Poll for URL changes every 1 s as a safety net
  setInterval(onSPANavigation, 1000);

  /* --------------------------------------------------------------- */
  /*  Bootstrap (runs on DOM idle — run_at: document_idle)            */
  /* --------------------------------------------------------------- */
  function init() {
    log("Content script loaded on: " + window.location.href);

    // Load company dataset (non-blocking — if it fails, we skip auto-tagging)
    fetch(chrome.runtime.getURL("companyData.json"))
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
      })
      .then((data) => {
        companyDataset = data;
        log(`Dataset loaded — ${Object.keys(data).length} slugs`);
      })
      .catch((err) => {
        log(`⚠ Dataset load failed (${err.message}) — manual-only tagging`);
      });

    problemName = detectProblemName();
    difficulty  = detectDifficulty();

    if (!problemName) {
      log("⚠ Could not detect problem name — retrying in 3 s");
      setTimeout(init, 3000);
      return;
    }

    log(`Problem detected — "${problemName}" [${difficulty || "unknown"}]`);
    log("⏳ Timer NOT started yet — waiting for Submit button click");

    // Attach submit-button listener (no MutationObserver yet!)
    attachSubmitListener();
  }

  init();
})();
