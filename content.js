/**
 * content.js — Injected into LeetCode problem pages.
 *
 * Flow:
 *   1. On page load → detect problem + difficulty, load dataset + problemMeta,
 *      find Submit button, attach click listener. Also listen for Ctrl+Enter.
 *   2. User clicks Submit or presses Ctrl+Enter → start timer, attach MutationObserver.
 *   3. Body mutation contains "Accepted" → save record to background.js.
 *   4. SPA navigation → reset everything, repeat from step 1.
 */

(function () {
  "use strict";

  /* --------------------------------------------------------------- */
  /*  State                                                           */
  /* --------------------------------------------------------------- */
  let problemName = null;
  let difficulty = null;
  let startTime = null;
  let observer = null;
  let submitBtnObserver = null;
  let documentSubmitListenerAttached = false;
  let alreadyAccepted = false;
  let currentURL = location.href;
  let companyDataset = null;
  let problemMeta = null;

  /* --------------------------------------------------------------- */
  /*  Utilities                                                       */
  /* --------------------------------------------------------------- */
  function log(msg) {
    console.log(`[LeetCode Tracker] ${msg}`);
  }

  /* --------------------------------------------------------------- */
  /*  Problem-name detection                                          */
  /* --------------------------------------------------------------- */
  function detectProblemName() {
    // Strategy 1: strip " - LeetCode" from document.title
    const raw = document.title || "";
    const name = raw.replace(/\s*[-–]\s*LeetCode\s*$/i, "").trim();
    if (name && name.length > 0) return name;

    // Strategy 2: find an h1 element
    const h1 = document.querySelector("h1");
    if (h1 && h1.textContent.trim().length > 0) return h1.textContent.trim();

    // Strategy 3: try __NEXT_DATA__
    try {
      const nextData = document.getElementById("__NEXT_DATA__");
      if (nextData) {
        const parsed = JSON.parse(nextData.textContent);
        const title = parsed?.props?.pageProps?.problem?.title
          || parsed?.props?.pageProps?.title;
        if (title) return title;
      }
    } catch (e) {}

    return null;
  }

  /* --------------------------------------------------------------- */
  /*  Difficulty detection — 6 strategies                              */
  /* --------------------------------------------------------------- */
  function detectDifficulty() {
    // Strategy 1: data-difficulty attribute
    const dataEl = document.querySelector("[data-difficulty]");
    if (dataEl) {
      const v = (dataEl.getAttribute("data-difficulty") || "").toLowerCase();
      if (["easy", "medium", "hard"].includes(v))
        return v.charAt(0).toUpperCase() + v.slice(1);
    }

    // Strategy 2: look near the title for difficulty text
    const titleEl =
      document.querySelector('[data-cy="problem-title"]') ||
      document.querySelector("h1");
    if (titleEl) {
      const container = titleEl.closest("div[class]") || titleEl.parentElement;
      if (container) {
        for (const span of container.querySelectorAll("span")) {
          const t = span.textContent.trim();
          if (t === "Easy") return "Easy";
          if (t === "Medium") return "Medium";
          if (t === "Hard") return "Hard";
        }
      }
    }

    // Strategy 3: scan page for leaf elements with difficulty text
    for (const el of document.querySelectorAll("span, div, strong")) {
      if (el.children.length === 0) {
        const t = el.textContent.trim();
        if (t === "Easy") return "Easy";
        if (t === "Medium") return "Medium";
        if (t === "Hard") return "Hard";
      }
    }

    // Strategy 4: __NEXT_DATA__ (Next.js embedded data)
    try {
      const nextData = document.getElementById("__NEXT_DATA__");
      if (nextData) {
        const parsed = JSON.parse(nextData.textContent);
        const diff = parsed?.props?.pageProps?.problem?.difficulty
          || parsed?.props?.pageProps?.difficulty;
        if (diff) {
          const d = diff.charAt(0).toUpperCase() + diff.slice(1).toLowerCase();
          if (["Easy", "Medium", "Hard"].includes(d)) return d;
        }
      }
    } catch (e) {}

    // Strategy 5: color-based detection (green=easy, yellow/orange=medium, red=hard)
    for (const el of document.querySelectorAll("span, div")) {
      if (el.children.length === 0) {
        const t = el.textContent.trim().toLowerCase();
        const style = window.getComputedStyle(el);
        const color = style.color;
        if (t === "easy" || color.includes("10, 150, 104") || color.includes("16, 163, 92")) return "Easy";
        if (t === "medium" || color.includes("192, 138, 0") || color.includes("204, 153, 0")) return "Medium";
        if (t === "hard" || color.includes("220, 53, 69") || color.includes("217, 64, 69")) return "Hard";
      }
    }

    // Strategy 6: title string fallback
    const raw = document.title || "";
    if (/\bEasy\b/i.test(raw)) return "Easy";
    if (/\bMedium\b/i.test(raw)) return "Medium";
    if (/\bHard\b/i.test(raw)) return "Hard";

    // Strategy 7: fallback from problemMeta.json dataset
    const slug = slugFromURL();
    if (problemMeta && slug && problemMeta[slug]) {
      log(`Difficulty from problemMeta: "${problemMeta[slug]}"`);
      return problemMeta[slug];
    }

    return null;
  }

  /* --------------------------------------------------------------- */
  /*  Company dataset lookup                                          */
  /* --------------------------------------------------------------- */
  function slugFromURL() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[1] : null;
  }

  function slugToName(slug) {
    if (!slug) return null;
    return slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  function lookupCompanies(slug) {
    if (!companyDataset || !slug) return [];
    const companies = companyDataset[slug];
    if (companies) {
      log(`Dataset match for "${slug}" → ${JSON.stringify(companies)}`);
      return [...companies];
    }
    log(`No dataset match for "${slug}"`);
    return [];
  }

  /* --------------------------------------------------------------- */
  /*  Dataset loading                                                 */
  /* --------------------------------------------------------------- */
  async function loadDatasets() {
    try {
      const resp = await fetch(chrome.runtime.getURL("companyData.json"));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      companyDataset = await resp.json();
      log(`Dataset loaded — ${Object.keys(companyDataset).length} slugs`);
    } catch (err) {
      log(`⚠ Company dataset load failed (${err.message}) — manual-only tagging`);
    }

    try {
      const resp = await fetch(chrome.runtime.getURL("problemMeta.json"));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      problemMeta = await resp.json();
      log(`ProblemMeta loaded — ${Object.keys(problemMeta).length} slugs`);
    } catch (err) {
      log(`⚠ ProblemMeta load failed (${err.message})`);
    }
  }

  /* --------------------------------------------------------------- */
  /*  Submit-button detection                                         */
  /* --------------------------------------------------------------- */
  function findSubmitButton() {
    return (
      document.querySelector('[data-e2e-locator="console-submit-button"]') ||
      document.querySelector('[data-e2e-locator="submit-button"]') ||
      document.querySelector('[data-testid="submit-button"]') ||
      document.querySelector('[data-e2e="submit-btn"]') ||
      [...document.querySelectorAll("button")].find(
        (b) => {
          const t = b.textContent.trim();
          return (t === "Submit" || t === "submit") && b.offsetParent !== null;
        }
      ) ||
      null
    );
  }

  function startSubmitButtonObserver() {
    if (submitBtnObserver) return;

    submitBtnObserver = new MutationObserver(() => {
      const btn = findSubmitButton();
      if (btn) {
        log("Submit button appeared in DOM — attaching listener");
        stopSubmitButtonObserver();
        setTimeout(() => attachSubmitListener(), 100);
      }
    });

    submitBtnObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Fallback: retry periodically
    const retryInterval = setInterval(() => {
      const btn = findSubmitButton();
      if (btn) {
        clearInterval(retryInterval);
        stopSubmitButtonObserver();
        attachSubmitListener();
      }
    }, 2000);

    // Give up after 15 seconds
    setTimeout(() => clearInterval(retryInterval), 15000);
  }

  function stopSubmitButtonObserver() {
    if (submitBtnObserver) {
      submitBtnObserver.disconnect();
      submitBtnObserver = null;
    }
  }

  // Document-level capture listener — catches ALL button clicks for debug + submit detection
  function documentClickHandler(e) {
    const target = e.target;
    if (!target || !target.closest) return;

    const btn = target.closest('button');
    if (!btn) return;

    const btnText = btn.textContent.trim().toLowerCase();
    log(`[debug] Button clicked: "${btnText}"`);

    // Start timer on submit click
    if (!startTime && !alreadyAccepted) {
      if (btnText.includes('submit')) {
        log('✅ Submit detected (capture) — starting timer');
        startTracking();
      }
    }
  }

  // Backup: detect submission by watching for Pending/Judging text in the result panel
  function documentMutationHandler(mutations) {
    if (startTime || alreadyAccepted) return;

    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.closest && node.closest('nav, header, [role=navigation]')) continue;
        const text = (node.textContent || '').toLowerCase();
        if (text.includes('pending') || text.includes('judging') || text.includes('running')) {
          log('✅ Detected Pending/Judging/Running (backup) — starting timer');
          startTracking();
          return;
        }
      }
      if (m.type === 'characterData' && m.target?.textContent) {
        const t = m.target.textContent.toLowerCase();
        if (t.includes('pending') || t.includes('judging') || t.includes('running')) {
          log('✅ Detected Pending/Judging/Running in text (backup) — starting timer');
          startTracking();
          return;
        }
      }
    }
  }

  let submitMutationObserver = null;

  function startSubmitDetection() {
    if (documentSubmitListenerAttached) return;
    document.addEventListener('click', documentClickHandler, true);
    submitMutationObserver = new MutationObserver(documentMutationHandler);
    submitMutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    documentSubmitListenerAttached = true;
    log('Submit detection: click listener + Pending/Judging observer attached');
  }

  function stopSubmitDetection() {
    if (documentSubmitListenerAttached) {
      document.removeEventListener('click', documentClickHandler, true);
      documentSubmitListenerAttached = false;
    }
    if (submitMutationObserver) {
      submitMutationObserver.disconnect();
      submitMutationObserver = null;
    }
    stopSubmitButtonObserver();
  }

  function attachSubmitListener() {
    startSubmitDetection();
  }

  function detachSubmitListener() {
    stopSubmitDetection();
  }

  /* --------------------------------------------------------------- */
  /*  Keyboard shortcut: Ctrl+Enter / Cmd+Enter                      */
  /* --------------------------------------------------------------- */
  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      // Only trigger if we're on a problem page and not already tracking
      if (!startTime && !alreadyAccepted && window.location.pathname.includes("/problems/")) {
        log("⌨️ Ctrl+Enter detected — starting timer");
        startTracking();
      }
    }
  }

  function attachKeyboardListener() {
    document.addEventListener("keydown", onKeyDown);
  }

  function detachKeyboardListener() {
    document.removeEventListener("keydown", onKeyDown);
  }

  /* --------------------------------------------------------------- */
  /*  Start tracking (called by submit click OR Ctrl+Enter)           */
  /* --------------------------------------------------------------- */
  function startTracking() {
    alreadyAccepted = false;
    startTime = Date.now();
    log(`Timer started at ${new Date(startTime).toISOString()}`);
    startResultPanelObserver();
  }

  /* --------------------------------------------------------------- */
  /*  Result-panel detection via MutationObserver                     */
  /*  Watch for both added nodes AND characterData changes            */
  /* --------------------------------------------------------------- */
  let debounceTimer = null;
  let allMutations = [];

  function checkForAccepted() {
    if (alreadyAccepted || !startTime) return;

    // Collect all text from all mutations
    let combinedText = "";
    for (const m of allMutations) {
      // Check added nodes
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Skip nav/header/sidebar
          if (node.closest && node.closest("nav, header, [role='navigation'], [role='banner'], [class*='sidebar']")) {
            continue;
          }
          combinedText += " " + (node.textContent || "");
        }
      }
      // Check characterData changes (text content updates in existing nodes)
      if (m.type === "characterData" && m.target?.textContent) {
        const parent = m.target.parentElement;
        if (parent && !parent.closest("nav, header, [role='navigation'], [role='banner'], [class*='sidebar']")) {
          combinedText += " " + m.target.textContent;
        }
      }
    }
    allMutations = [];

    if (!combinedText) return;

    // Check for "Accepted" but filter out "Accepted Solutions" tabs
    if (/\bAccepted\b/.test(combinedText)) {
      const isTabOrLabel = /Accepted Solutions\b/i.test(combinedText) || /Accepted [0-9]/i.test(combinedText);
      if (!isTabOrLabel) {
        log("🎯 Accepted detected — calling accepted()");
        accepted();
        return;
      }
    }

    // Also check for rejection status to stop watching
    if (/\bWrong Answer\b|\bTime Limit Exceeded\b|\bRuntime Error\b|\bCompile Error\b/i.test(combinedText)) {
      log("Result is not Accepted — stopping observer for this attempt");
      stopResultPanelObserver();
    }
  }

  function startResultPanelObserver() {
    stopResultPanelObserver();
    allMutations = [];

    observer = new MutationObserver((mutations) => {
      allMutations.push(...mutations);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkForAccepted, 800);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    log("MutationObserver watching for Accepted (childList + characterData)");

    // Also poll as a safety net — check result area text every 2 seconds
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      if (alreadyAccepted || pollCount > 60) { // stop after 2 minutes
        clearInterval(pollInterval);
        return;
      }
      // Check result-specific elements only, not whole body (body always contains "Accepted" tab)
      const resultEl =
        document.querySelector('[data-e2e-locator="submission-result"]') ||
        document.querySelector('[data-e2e-locator="console-result-state"]') ||
        document.querySelector('.result-state') ||
        document.querySelector('[class*="result-container"]') ||
        document.querySelector('[class*="ResultState"]');
      if (resultEl) {
        const txt = resultEl.textContent || "";
        if (/\bAccepted\b/.test(txt) && !/Accepted Solutions/i.test(txt)) {
          log("Accepted detected via result element polling");
          clearInterval(pollInterval);
          accepted();
        }
      }
    }, 2000);
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

    const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : null;
    if (elapsed === null) {
      log(`⚠ Accepted — ${problemName} (${difficulty}) — but timer was not started (no submit click detected). Saving with no time.`);
    } else {
      log(`✅ Accepted — ${problemName} (${difficulty}) — ${elapsed}s`);
    }

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

    saveCurrentProblem();
  }

  /* --------------------------------------------------------------- */
  /*  Current problem storage                                         */
  /* --------------------------------------------------------------- */
  function saveCurrentProblem() {
    const slug = slugFromURL();
    const companies = lookupCompanies(slug);
    const state = {
      name: problemName,
      difficulty,
      slug,
      companies,
      url: window.location.href,
      timestamp: Date.now(),
    };
    chrome.storage.local.set({ currentProblem: state }, () => {
      log(`Saved current problem to storage: "${problemName}" [${companies.length} companies]`);
      chrome.runtime.sendMessage({ type: "CURRENT_PROBLEM_UPDATED" }).catch(() => {});
    });
  }

  /* --------------------------------------------------------------- */
  /*  Re-detect difficulty (retry with longer delays for slow pages)  */
  /* --------------------------------------------------------------- */
  async function fetchDifficultyGraphQL(slug) {
    if (!slug) return null;
    try {
      const resp = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query questionTitle($titleSlug: String!) { question(titleSlug: $titleSlug) { difficulty } }`,
          variables: { titleSlug: slug }
        })
      });
      const data = await resp.json();
      if (data?.data?.question?.difficulty) {
        return data.data.question.difficulty;
      }
    } catch (e) {}
    return null;
  }

  function retryDifficulty() {
    if (difficulty) return; // already have it
    // Try again at 2s, 5s, 10s after page load
    [2000, 5000, 10000].forEach((delay) => {
      setTimeout(async () => {
        if (!difficulty) {
          difficulty = detectDifficulty();
          if (!difficulty) {
            difficulty = await fetchDifficultyGraphQL(slugFromURL());
          }
          if (difficulty) {
            log(`Difficulty detected on retry (${delay}ms): "${difficulty}"`);
            saveCurrentProblem();
          }
        }
      }, delay);
    });
  }

  /* --------------------------------------------------------------- */
  /*  SPA navigation handling                                         */
  /* --------------------------------------------------------------- */
  function onSPANavigation() {
    const newURL = location.href;
    if (newURL === currentURL) return;

    log(`SPA navigation: ${currentURL} → ${newURL}`);
    currentURL = newURL;

    stopResultPanelObserver();
    detachSubmitListener();
    alreadyAccepted = false;
    startTime = null;

    if (!newURL.includes("/problems/")) {
      chrome.storage.local.remove(["currentProblem"]);
      return;
    }

    // Delay to let React render the new problem page
    setTimeout(() => {
      problemName = detectProblemName();
      difficulty = detectDifficulty();

      if (!problemName) {
        const slug = slugFromURL();
        problemName = slugToName(slug);
        if (problemName) log(`Fallback name from slug: "${problemName}"`);
      }

      log(`New problem — "${problemName}" [${difficulty || "unknown"}]`);
      retryDifficulty();
      saveCurrentProblem();
      attachSubmitListener();

      // Re-save at 3s with fully-rendered title and companies
      setTimeout(() => {
        const lateName = detectProblemName();
        if (lateName && lateName !== problemName) {
          problemName = lateName;
          log(`Updated problem name after late render: "${problemName}"`);
        }
        if (!difficulty) difficulty = detectDifficulty();
        saveCurrentProblem();
        attachSubmitListener();
      }, 3000);
    }, 1500);
  }

  window.addEventListener("popstate", onSPANavigation);

  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    origPush.apply(this, args);
    setTimeout(onSPANavigation, 300);
  };
  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    setTimeout(onSPANavigation, 300);
  };

  // Check for submit button re-render every 3 seconds while on a problem page
  setInterval(() => {
    if (window.location.pathname.includes("/problems/")) {
      attachSubmitListener();
    }
  }, 3000);

  setInterval(onSPANavigation, 1000);

  /* --------------------------------------------------------------- */
  /*  Bootstrap                                                       */
  /* --------------------------------------------------------------- */
  async function init() {
    log("Content script loaded on: " + window.location.href);

    await loadDatasets();

    if (!window.location.pathname.startsWith("/problems/")) {
      log("Not on a problem page — skipping");
      return;
    }

    problemName = detectProblemName();
    difficulty = detectDifficulty();

    if (!problemName) {
      const slug = slugFromURL();
      problemName = slugToName(slug);
      if (problemName) log(`Fallback name from slug: "${problemName}"`);
    }

    if (!problemName) {
      log("⚠ Could not detect problem name — retrying in 3s");
      setTimeout(init, 3000);
      return;
    }

    log(`Problem detected — "${problemName}" [${difficulty || "unknown"}]`);
    log("⏳ Timer NOT started yet — waiting for Submit button click or Ctrl+Enter");

    retryDifficulty();
    saveCurrentProblem();
    attachSubmitListener();
    attachKeyboardListener();
  }

  init();
})();
