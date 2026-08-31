/**
 * popup.js — Reads solve records from chrome.storage.local and renders
 * the popup: current problem with company logos, summary stats,
 * average times, recent solves, and filtering.
 */

let allSolves = [];

document.addEventListener("DOMContentLoaded", () => {
  console.log("[LeetCode Tracker Popup] Loaded");
  render();

  // Retry after 1s and 3s in case content script hasn't saved currentProblem yet
  setTimeout(render, 1000);
  setTimeout(render, 3000);

  // Auto-sync silently when popup opens (at most once every 30 minutes)
  chrome.storage.local.get({ lastSyncTime: 0 }, ({ lastSyncTime }) => {
    const thirtyMin = 30 * 60 * 1000;
    if (Date.now() - lastSyncTime > thirtyMin) {
      syncProfileSilent();
    }
  });
});

// Re-render when content script reports dataset is loaded OR current problem updated
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "DATASET_LOADED" || msg.type === "CURRENT_PROBLEM_UPDATED") {
    console.log(`[LeetCode Tracker Popup] Re-rendering on: ${msg.type}`);
    render();
  }
});

function render(filterCompany) {
  chrome.storage.local.get({ solves: [], currentProblem: null }, (data) => {
    if (chrome.runtime.lastError) {
      console.error("[LeetCode Tracker Popup] Storage error:", chrome.runtime.lastError);
      return;
    }

    allSolves = data.solves;
    console.log(`[LeetCode Tracker Popup] ${allSolves.length} solve(s) found`);

    // ---- Current problem ----
    renderCurrentProblem(data.currentProblem);

    // Hide everything first
    document.getElementById("emptyState").classList.add("hidden");
    document.getElementById("summary").classList.add("hidden");
    document.getElementById("averages").classList.add("hidden");
    document.getElementById("recent").classList.add("hidden");
    document.getElementById("exportBtn").classList.add("hidden");
    document.getElementById("filterBar").classList.add("hidden");

    if (allSolves.length === 0) {
      document.getElementById("emptyState").classList.remove("hidden");
      return;
    }

    // Apply company filter
    const solves = filterCompany
      ? filterCompany === "__NO_COMPANY__"
        ? allSolves.filter((s) => !s.companies || s.companies.length === 0)
        : allSolves.filter((s) => (s.companies || []).includes(filterCompany))
      : allSolves;

    if (solves.length === 0) {
      document.getElementById("emptyState").classList.remove("hidden");
      return;
    }

    // ---- Show sections ----
    document.getElementById("summary").classList.remove("hidden");
    document.getElementById("averages").classList.remove("hidden");
    document.getElementById("recent").classList.remove("hidden");
    document.getElementById("exportBtn").classList.remove("hidden");
    document.getElementById("filterBar").classList.remove("hidden");

    // ---- Populate company filter dropdown ----
    populateCompanyFilter(filterCompany);

    // ---- Difficulty counts ----
    const counts = { Easy: 0, Medium: 0, Hard: 0, Unknown: 0 };
    const times = { Easy: [], Medium: [], Hard: [] };

    for (const s of solves) {
      const d = s.difficulty;
      if (d === "Easy" || d === "Medium" || d === "Hard") {
        counts[d]++;
        // Only include timed solves in avg time
        if (s.timeSpentSeconds != null && s.timeSpentSeconds > 0) {
          times[d].push(s.timeSpentSeconds);
        }
      } else {
        counts.Unknown++;
      }
    }

    document.getElementById("totalSolved").textContent = solves.length;
    document.getElementById("easyCount").textContent = counts.Easy;
    document.getElementById("mediumCount").textContent = counts.Medium;
    document.getElementById("hardCount").textContent = counts.Hard;

    // ---- Average times table ----
    const avgTbody = document.querySelector("#avgTable tbody");
    avgTbody.innerHTML = "";
    let hasAvgData = false;
    for (const diff of ["Easy", "Medium", "Hard"]) {
      if (counts[diff] === 0) continue;
      const arr = times[diff];
      const avgStr = arr.length > 0
        ? formatTime(arr.reduce((a, b) => a + b, 0) / arr.length)
        : null;
      if (arr.length > 0) hasAvgData = true;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="diff-badge ${diff.toLowerCase()}">${diff}</span></td>
        <td class="time-val">${avgStr || '<span style="color:var(--text-dim);font-size:12px;white-space:nowrap">Not tracked</span>'}</td>`;
      avgTbody.appendChild(tr);
    }
    if (!hasAvgData && (counts.Easy + counts.Medium + counts.Hard > 0)) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="2" style="color:var(--text-dim);font-size:11px;padding:4px 12px;">Submit via extension to track solve time</td>`;
      avgTbody.appendChild(tr);
    }

    // ---- Recent solves (last 10, most recent first by date) ----
    const recent = [...solves]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
    const recentTbody = document.querySelector("#recentTable tbody");
    recentTbody.innerHTML = "";
    for (const s of recent) {
      const tr = document.createElement("tr");
      const dateStr = s.date ? formatDate(s.date) : "\u2014";
      const diff = s.difficulty;
      const diffClass = (diff === "Easy" || diff === "Medium" || diff === "Hard") ? diff.toLowerCase() : "unknown";
      const diffLabel = diff || "?";
      const hasTime = s.timeSpentSeconds != null && s.timeSpentSeconds > 0;
      const timeStr = hasTime ? formatTime(s.timeSpentSeconds) : '<span style="color:var(--text-dim);font-size:11px;white-space:nowrap">\u23f1 Not tracked</span>';

      tr.innerHTML = `
        <td class="problem-name" title="${escapeHtml(s.problemName)}">${escapeHtml(s.problemName)}</td>
        <td><span class="diff-badge ${diffClass}">${escapeHtml(diffLabel)}</span></td>
        <td class="time-col">${timeStr}</td>
        <td class="date-col">${dateStr}</td>`;
      recentTbody.appendChild(tr);
    }
  });
}

/* ---- Current problem ---- */

function renderCurrentProblem(problem) {
  const section = document.getElementById("currentProblem");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];

    // Only show if the ACTIVE TAB is a LeetCode problem page
    if (!activeTab || !activeTab.url || !activeTab.url.includes("leetcode.com/problems/")) {
      section.classList.add("hidden");
      return;
    }

    // If no problem from content script, try to read from storage again
    if (!problem || !problem.name) {
      chrome.storage.local.get({ currentProblem: null }, (retry) => {
        if (retry.currentProblem && retry.currentProblem.name) {
          if (retry.currentProblem.slug && activeTab.url.includes(retry.currentProblem.slug)) {
            renderCurrentProblem(retry.currentProblem);
          } else {
            section.classList.add("hidden");
          }
        } else {
          section.classList.add("hidden");
        }
      });
      return;
    }

    // Double check that the problem in storage matches the current active tab
    if (problem.slug && !activeTab.url.includes(problem.slug)) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    document.getElementById("currentName").textContent = problem.name;

    const diffEl = document.getElementById("currentDiff");
    const diff = problem.difficulty || "Unknown";
    diffEl.textContent = diff;
    diffEl.className = "current-diff " + (diff || "unknown").toLowerCase();
    const companiesEl = document.getElementById("currentCompanies");
    const companies = problem.companies || [];

    function renderCompanies(list) {
      if (list.length > 0) {
        companiesEl.innerHTML = list
          .map((c) => `<div class="current-company">${companyLogoHTMLNoRemove(c)}<span class="current-company-name">${escapeHtml(c)}</span></div>`)
          .join("");
      } else {
        companiesEl.innerHTML = '<span class="no-companies">No company data</span>';
      }
    }

    if (companies.length > 0) {
      renderCompanies(companies);
    } else {
      // Companies might not be saved yet — try loading dataset directly
      companiesEl.innerHTML = '<span class="no-companies">Looking up companies...</span>';
      (async () => {
        try {
          const dsResp = await fetch(chrome.runtime.getURL('companyData.json'));
          const ds = await dsResp.json();
          const slug = problem.slug || '';
          const fromDataset = ds[slug] || [];
          if (fromDataset.length > 0) {
            renderCompanies(fromDataset);
            // Also update storage so next open is instant
            chrome.storage.local.get({ currentProblem: null }, (data) => {
              if (data.currentProblem && data.currentProblem.slug === slug) {
                data.currentProblem.companies = [...fromDataset];
                chrome.storage.local.set({ currentProblem: data.currentProblem });
              }
            });
          } else {
            companiesEl.innerHTML = '<span class="no-companies">No company data — tag manually after solving</span>';
          }
        } catch (e) {
          companiesEl.innerHTML = '<span class="no-companies">No company data</span>';
        }
      })();
    }
  });
}

/* ---- Company logo helper ---- */

const LOCAL_LOGOS = {
  amazon: "amazon.svg",
  google: "google.svg",
  microsoft: "microsoft.svg",
  apple: "apple.svg",
  facebook: "facebook.svg",
  meta: "meta.svg",
  adobe: "adobe.svg",
  netflix: "netflix.svg",
  uber: "uber.svg",
  airbnb: "airbnb.svg",
  spotify: "spotify.svg",
  linkedin: "linkedin.svg",
  nvidia: "nvidia.svg",
  samsung: "samsung.svg",
  oracle: "oracle.svg",
  salesforce: "salesforce.svg",
  walmart: "walmart.svg",
  tiktok: "tiktok.svg",
  twitter: "twitter.svg",
  x: "x.svg",
  bytedance: "bytedance.svg",
};

const COMPANY_COLORS = {
  amazon: "#FF9900",
  google: "#4285F4",
  microsoft: "#00A4EF",
  apple: "#555555",
  facebook: "#1877F2",
  meta: "#0082FB",
  adobe: "#FF0000",
  netflix: "#E50914",
  twitter: "#1DA1F2",
  x: "#000000",
  tiktok: "#010101",
  bytedance: "#010101",
  spotify: "#1DB954",
  uber: "#000000",
  airbnb: "#FF5A5F",
  linkedin: "#0A66C2",
  nvidia: "#76B900",
  samsung: "#1428A0",
  oracle: "#C74634",
  salesforce: "#00A1E0",
  walmart: "#0071CE",
};

function companyLogoURL(company) {
  const key = company.toLowerCase().replace(/\s+/g, "");
  const file = LOCAL_LOGOS[key];
  if (file) {
    try { return chrome.runtime.getURL(`logos/${file}`); } catch (e) { return null; }
  }
  return null;
}

function companyColor(company) {
  const key = company.toLowerCase().replace(/\s+/g, "");
  return COMPANY_COLORS[key] || "#8a8279";
}

function companyLogoHTMLNoRemove(company) {
  const url = companyLogoURL(company);
  const color = companyColor(company);
  const initial = escapeHtml(company.charAt(0).toUpperCase());
  const name = escapeHtml(company);

  if (url) {
    return `<img class="company-logo current-logo" src="${url}" alt="${name}" title="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'" /><span class="company-logo-fallback current-fallback" style="display:none;background:${color};color:#fff">${initial}</span>`;
  }
  return `<span class="company-logo-fallback current-fallback" style="display:inline-flex;background:${color};color:#fff">${initial}</span>`;
}

/* ---- Company filter ---- */

function populateCompanyFilter(currentFilter) {
  const select = document.getElementById("companyFilter");
  const clearBtn = document.getElementById("clearFilter");

  const companySet = new Set();
  for (const s of allSolves) {
    for (const c of (s.companies || [])) {
      companySet.add(c);
    }
  }

  const sorted = [...companySet].sort();
  select.innerHTML = '<option value="">All companies</option>';

  const noCompanyOpt = document.createElement("option");
  noCompanyOpt.value = "__NO_COMPANY__";
  noCompanyOpt.textContent = "No Company";
  if (currentFilter === "__NO_COMPANY__") noCompanyOpt.selected = true;
  select.appendChild(noCompanyOpt);

  for (const c of sorted) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    if (c === currentFilter) opt.selected = true;
    select.appendChild(opt);
  }

  clearBtn.classList.toggle("hidden", !currentFilter);

  select.onchange = () => {
    render(select.value || undefined);
  };

  clearBtn.onclick = () => {
    select.value = "";
    render();
  };
}

/* ---- Sync LeetCode profile ---- */

function syncProfileSilent() {
  syncProfile(true);
}

async function syncProfile(silent = false) {
  const syncBtn = document.getElementById("syncBtn");
  const syncStatus = document.getElementById("syncStatus");

  if (!silent) {
    syncBtn.disabled = true;
    syncBtn.textContent = "Syncing...";
    syncStatus.textContent = "";
  }

  try {
    // Step 1: Get current user via GraphQL
    if (!silent) syncStatus.textContent = "Checking login...";
    const userResp = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        query: `query { userStatus { username isSignedIn } }`,
      }),
    });
    const userData = await userResp.json();
    const userStatus = userData?.data?.userStatus;

    if (!userStatus?.isSignedIn || !userStatus?.username) {
      if (!silent) {
        syncStatus.textContent = "Not logged in \u2014 please log in to LeetCode first.";
        syncBtn.disabled = false;
        syncBtn.textContent = "Sync my LeetCode profile";
      }
      return;
    }
    const username = userStatus.username;
    console.log(`[LeetCode Tracker Popup] Detected username: ${username}`);

    // Step 2: Get recent accepted submissions
    if (!silent) syncStatus.textContent = `Fetching submissions for ${username}...`;
    const recentResp = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        query: `
          query recentAcSubmissions($username: String!, $limit: Int!) {
            recentAcSubmissionList(username: $username, limit: $limit) {
              id
              title
              titleSlug
              timestamp
            }
          }`,
        variables: { username, limit: 50 },
      }),
    });
    const recentData = await recentResp.json();
    const recentSubs = recentData?.data?.recentAcSubmissionList || [];

    // Step 3: Fetch all submissions to estimate solve time
    if (!silent) syncStatus.textContent = "Estimating solve times...";
    let allSubmissions = [];
    try {
      const allSubsResp = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          query: `
            query recentSubmissions($username: String!, $limit: Int!) {
              recentSubmissionList(username: $username, limit: $limit) {
                id
                titleSlug
                timestamp
                statusDisplay
              }
            }`,
          variables: { username, limit: 200 },
        }),
      });
      const allSubsData = await allSubsResp.json();
      allSubmissions = allSubsData?.data?.recentSubmissionList || [];
    } catch (e) {
      console.log("[LeetCode Tracker Popup] Could not fetch full submission list");
    }

    // For each problem+day, find the earliest submission timestamp
    const firstAttemptMap = {};
    for (const sub of allSubmissions) {
      const ts = parseInt(sub.timestamp);
      const day = new Date(ts * 1000).toISOString().slice(0, 10);
      const key = `${sub.titleSlug}|${day}`;
      if (!firstAttemptMap[key] || ts < firstAttemptMap[key]) {
        firstAttemptMap[key] = ts;
      }
    }

    // Step 4: Load company dataset and problem metadata
    if (!silent) syncStatus.textContent = "Loading company dataset...";
    let companyDataset = {};
    let problemMeta = {};
    try {
      const dsResp = await fetch(chrome.runtime.getURL("companyData.json"));
      companyDataset = await dsResp.json();
      console.log(`[LeetCode Tracker Popup] Dataset loaded ${Object.keys(companyDataset).length} slugs`);
    } catch (e) {
      console.log("[LeetCode Tracker Popup] Dataset load failed, syncing without companies");
    }
    try {
      const metaResp = await fetch(chrome.runtime.getURL("problemMeta.json"));
      problemMeta = await metaResp.json();
      console.log(`[LeetCode Tracker Popup] ProblemMeta loaded ${Object.keys(problemMeta).length} slugs`);
    } catch (e) {
      console.log("[LeetCode Tracker Popup] ProblemMeta load failed");
    }

    // Step 5: Merge into storage
    if (!silent) syncStatus.textContent = "Saving to storage...";
    
    const data = await chrome.storage.local.get({ solves: [] });
    const existing = data.solves;
    const existingKeys = new Set(
      existing.map((s) => `${s.problemName}|${s.date?.slice(0, 10)}`)
    );

    let added = 0;
    for (const sub of recentSubs) {
      const acceptedTs = parseInt(sub.timestamp);
      const date = new Date(acceptedTs * 1000).toISOString();
      const day = date.slice(0, 10);
      const key = `${sub.title}|${day}`;
      if (existingKeys.has(key)) continue;

      const firstTs = firstAttemptMap[`${sub.titleSlug}|${day}`];
      const timeSpentSeconds = firstTs && firstTs < acceptedTs ? (acceptedTs - firstTs) : null;

      const companies = companyDataset[sub.titleSlug] || [];
      const difficulty = problemMeta[sub.titleSlug] || null;
      existing.push({
        problemName: sub.title,
        difficulty,
        timeSpentSeconds,
        date,
        url: `https://leetcode.com/problems/${sub.titleSlug}/`,
        slug: sub.titleSlug,
        companies: [...companies],
      });
      existingKeys.add(key);
      added++;
    }

    // Backfill: fix 0-time records, add missing difficulty/companies
    let updated = 0;
    const missingDifficultySlugs = new Set();
    
    for (const s of existing) {
      if (!s.slug) continue;
      if (!s.difficulty) {
        if (problemMeta[s.slug]) {
          s.difficulty = problemMeta[s.slug];
          updated++;
        } else {
          missingDifficultySlugs.add(s.slug);
        }
      }
      if ((!s.companies || s.companies.length === 0) && companyDataset[s.slug]?.length > 0) {
        s.companies = [...companyDataset[s.slug]];
        updated++;
      }
      if (s.timeSpentSeconds === 0 || s.timeSpentSeconds === null || s.timeSpentSeconds === undefined) {
        if (s.date && s.slug) {
          const day = s.date.slice(0, 10);
          const firstTs = firstAttemptMap[`${s.slug}|${day}`];
          const acceptedTs = Math.round(new Date(s.date).getTime() / 1000);
          if (firstTs && firstTs < acceptedTs) {
            s.timeSpentSeconds = acceptedTs - firstTs;
            updated++;
          } else if (s.timeSpentSeconds === 0) {
            s.timeSpentSeconds = null;
            updated++;
          }
        } else if (s.timeSpentSeconds === 0) {
          s.timeSpentSeconds = null;
          updated++;
        }
      }
    }

    // Fetch missing difficulties via GraphQL
    for (const slug of missingDifficultySlugs) {
      try {
        const resp = await fetch("https://leetcode.com/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `query questionTitle($titleSlug: String!) { question(titleSlug: $titleSlug) { difficulty } }`,
            variables: { titleSlug: slug }
          })
        });
        const gqlData = await resp.json();
        const diff = gqlData?.data?.question?.difficulty;
        if (diff) {
          for (const s of existing) {
            if (s.slug === slug && !s.difficulty) {
              s.difficulty = diff;
              updated++;
            }
          }
        }
      } catch (e) {}
    }

    if (updated > 0) console.log(`[LeetCode Tracker Popup] Backfilled ${updated} field(s)`);

    await chrome.storage.local.set({ solves: existing, lastSyncTime: Date.now() });
    console.log(`[LeetCode Tracker Popup] Synced ${added} new solve(s). Total: ${existing.length}`);
    
    if (!silent) {
      syncStatus.textContent = `Synced ${added} new solve(s). Total: ${existing.length}`;
      syncBtn.disabled = false;
      syncBtn.textContent = "Sync my LeetCode profile";
    }
    render();
  } catch (err) {
    console.error("[LeetCode Tracker Popup] Sync error:", err);
    if (!silent) {
      syncStatus.textContent = `Sync failed: ${err.message}`;
      syncBtn.disabled = false;
      syncBtn.textContent = "Sync my LeetCode profile";
    }
  }
}

document.getElementById("syncBtn").addEventListener("click", () => syncProfile(false));

/* ---- Export ---- */

document.getElementById("exportBtn").addEventListener("click", () => {
  chrome.storage.local.get({ solves: [] }, (data) => {
    const blob = new Blob([JSON.stringify(data.solves, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leetcode-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log(`[LeetCode Tracker Popup] Exported ${data.solves.length} solve(s)`);
  });
});

/* ---- Helpers ---- */

function formatTime(seconds) {
  seconds = Math.round(seconds);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const month = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  return `${month} ${day}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
