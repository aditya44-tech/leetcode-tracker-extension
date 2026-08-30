/**
 * popup.js — Reads solve records from chrome.storage.local and renders
 * the popup: current problem with company logos, summary stats,
 * average times, recent solves with company logo badges, and filtering.
 */

let allSolves = [];

document.addEventListener("DOMContentLoaded", () => {
  console.log("[LeetCode Tracker Popup] Loaded");
  render();
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

    if (allSolves.length === 0) {
      document.getElementById("emptyState").classList.remove("hidden");
      return;
    }

    // Apply company filter
    const solves = filterCompany
      ? allSolves.filter((s) => (s.companies || []).includes(filterCompany))
      : allSolves;

    // ---- Show sections ----
    document.getElementById("summary").classList.remove("hidden");
    document.getElementById("averages").classList.remove("hidden");
    document.getElementById("recent").classList.remove("hidden");
    document.getElementById("exportBtn").classList.remove("hidden");
    document.getElementById("clearBtn").classList.remove("hidden");
    document.getElementById("filterBar").classList.remove("hidden");

    // ---- Populate company filter dropdown ----
    populateCompanyFilter(filterCompany);

    // ---- Difficulty counts ----
    const counts = { Easy: 0, Medium: 0, Hard: 0 };
    const times  = { Easy: [], Medium: [], Hard: [] };

    for (const s of solves) {
      const d = s.difficulty || "Medium";
      counts[d] = (counts[d] || 0) + 1;
      times[d]  = times[d] || [];
      times[d].push(s.timeSpentSeconds || 0);
    }

    document.getElementById("totalSolved").textContent = solves.length;
    document.getElementById("easyCount").textContent   = counts.Easy;
    document.getElementById("mediumCount").textContent = counts.Medium;
    document.getElementById("hardCount").textContent   = counts.Hard;

    // ---- Average times ----
    const avgTbody = document.querySelector("#avgTable tbody");
    avgTbody.innerHTML = "";
    for (const diff of ["Easy", "Medium", "Hard"]) {
      const arr = times[diff];
      if (arr.length === 0) continue;
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="diff-badge ${diff.toLowerCase()}">${diff}</span></td>
        <td class="time-val">${formatTime(avg)}</td>`;
      avgTbody.appendChild(tr);
    }

    // ---- Recent solves (last 10, most recent first) ----
    const recent = [...solves].reverse().slice(0, 10);
    const recentTbody = document.querySelector("#recentTable tbody");
    recentTbody.innerHTML = "";
    for (let i = 0; i < recent.length; i++) {
      const s = recent[i];
      const realIndex = allSolves.indexOf(s);
      const tr = document.createElement("tr");
      const dateStr = s.date ? formatDate(s.date) : "—";
      const diff = s.difficulty || "Medium";
      const companies = s.companies || [];

      // Company logos instead of names
      const tagsHTML = companies.length > 0
        ? companies.map((c) => companyLogoHTML(c, realIndex)).join("")
        : `<button class="tag-add-btn" data-index="${realIndex}">+ Tag</button>`;

      tr.innerHTML = `
        <td class="problem-name" title="${escapeHtml(s.problemName)}">${escapeHtml(s.problemName)}</td>
        <td class="tags-cell">${tagsHTML}</td>
        <td class="time-col">${formatTime(s.timeSpentSeconds || 0)}</td>
        <td class="date-col">${dateStr}</td>`;
      recentTbody.appendChild(tr);
    }

    // ---- Wire up tag events ----
    wireTagEvents();
  });
}

/* ---- Current problem ---- */

function renderCurrentProblem(problem) {
  const section = document.getElementById("currentProblem");
  if (!problem || !problem.name) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  document.getElementById("currentName").textContent = problem.name;

  const diffEl = document.getElementById("currentDiff");
  const diff = problem.difficulty || "Unknown";
  diffEl.textContent = diff;
  diffEl.className = "current-diff " + diff.toLowerCase();

  const companiesEl = document.getElementById("currentCompanies");
  const companies = problem.companies || [];

  if (companies.length > 0) {
    companiesEl.innerHTML = companies
      .map((c) => `<div class="current-company">${companyLogoHTMLNoRemove(c)}<span class="current-company-name">${escapeHtml(c)}</span></div>`)
      .join("");
  } else {
    companiesEl.innerHTML = '<span class="no-companies">No company data — tag manually after solving</span>';
  }
}

/* ---- Company logo helper ---- */

// Local logo mapping: company name -> filename in logos/
const LOCAL_LOGOS = {
  amazon:    "amazon.svg",
  google:    "google.png",
  microsoft: "microsoft.svg",
  apple:     "apple.png",
  facebook:  "facebook.png",
  meta:      "facebook.png",
  adobe:     "adobe.svg",
};

// Fallback colors for companies without a local logo
const COMPANY_COLORS = {
  amazon:    "#FF9900",
  google:    "#4285F4",
  microsoft: "#737373",
  apple:     "#555555",
  facebook:  "#1877F2",
  meta:      "#1877F2",
  adobe:     "#FF0000",
  netflix:   "#E50914",
  twitter:   "#1DA1F2",
  tiktok:    "#000000",
  bytedance: "#000000",
  spotify:   "#1DB954",
  uber:      "#000000",
  airbnb:    "#FF5A5F",
  linkedin:  "#0A66C2",
  nvidia:    "#76B900",
  samsung:   "#1428A0",
  oracle:    "#C74634",
  salesforce:"#00A1E0",
  walmart:   "#0071CE",
};

function companyLogoURL(company) {
  const key = company.toLowerCase().replace(/\s+/g, "");
  const file = LOCAL_LOGOS[key];
  if (file) {
    return chrome.runtime.getURL(`logos/${file}`);
  }
  return null; // no local logo
}

function companyColor(company) {
  const key = company.toLowerCase().replace(/\s+/g, "");
  return COMPANY_COLORS[key] || "#8a8279"; // default to text-dim
}

function companyLogoHTML(company, solveIndex) {
  const url = companyLogoURL(company);
  const color = companyColor(company);
  const initial = escapeHtml(company.charAt(0).toUpperCase());
  const name = escapeHtml(company);

  if (url) {
    // Has a local logo file
    return `<span class="company-logo-pill" title="${name}" data-company="${name}" data-index="${solveIndex}">
      <img class="company-logo" src="${url}" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'" />
      <span class="company-logo-fallback" style="display:none;background:${color};color:#fff">${initial}</span>
      <button class="pill-remove" data-company="${name}" data-index="${solveIndex}" title="Remove">×</button>
    </span>`;
  }
  // No local logo — colored initial badge
  return `<span class="company-logo-pill" title="${name}" data-company="${name}" data-index="${solveIndex}">
    <span class="company-logo-fallback" style="display:inline-flex;background:${color};color:#fff">${initial}</span>
    <button class="pill-remove" data-company="${name}" data-index="${solveIndex}" title="Remove">×</button>
  </span>`;
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
  for (const c of sorted) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    if (c === currentFilter) opt.selected = true;
    select.appendChild(opt);
  }

  clearBtn.classList.toggle("hidden", !currentFilter);

  select.onchange = () => {
    const val = select.value;
    render(val || undefined);
  };

  clearBtn.onclick = () => {
    select.value = "";
    render();
  };
}

/* ---- Tag events ---- */

function wireTagEvents() {
  document.querySelectorAll(".pill-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const company = btn.dataset.company;
      const index = parseInt(btn.dataset.index, 10);
      removeTag(index, company);
    });
  });

  document.querySelectorAll(".tag-add-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      showTagInput(btn, index);
    });
  });
}

function showTagInput(btn, solveIndex) {
  const wrapper = document.createElement("span");
  wrapper.className = "tag-input-wrapper";
  wrapper.innerHTML = `<input type="text" class="tag-input" placeholder="Company name" />`;

  btn.replaceWith(wrapper);
  const input = wrapper.querySelector("input");
  input.focus();

  const addTag = () => {
    const name = input.value.trim();
    if (name) {
      addTagToStorage(solveIndex, name);
    } else {
      wrapper.replaceWith(btn);
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTag();
    if (e.key === "Escape") wrapper.replaceWith(btn);
  });

  input.addEventListener("blur", addTag);
}

function addTagToStorage(solveIndex, company) {
  const solves = [...allSolves];
  if (!solves[solveIndex]) return;

  const record = { ...solves[solveIndex] };
  record.companies = [...(record.companies || [])];

  if (!record.companies.includes(company)) {
    record.companies.push(company);
    console.log(`[LeetCode Tracker Popup] Tag added: "${company}" → ${record.problemName}`);
  }

  solves[solveIndex] = record;
  chrome.storage.local.set({ solves }, () => {
    if (chrome.runtime.lastError) {
      console.error("[LeetCode Tracker Popup] Tag save error:", chrome.runtime.lastError);
    }
    const currentFilter = document.getElementById("companyFilter").value || undefined;
    render(currentFilter);
  });
}

function removeTag(solveIndex, company) {
  const solves = [...allSolves];
  if (!solves[solveIndex]) return;

  const record = { ...solves[solveIndex] };
  record.companies = (record.companies || []).filter((c) => c !== company);
  console.log(`[LeetCode Tracker Popup] Tag removed: "${company}" from ${record.problemName}`);

  solves[solveIndex] = record;
  chrome.storage.local.set({ solves }, () => {
    if (chrome.runtime.lastError) {
      console.error("[LeetCode Tracker Popup] Tag remove error:", chrome.runtime.lastError);
    }
    const currentFilter = document.getElementById("companyFilter").value || undefined;
    render(currentFilter);
  });
}

/* ---- Sync LeetCode profile ---- */

async function syncProfile() {
  const syncBtn = document.getElementById("syncBtn");
  const syncStatus = document.getElementById("syncStatus");

  syncBtn.disabled = true;
  syncBtn.textContent = "Syncing...";
  syncStatus.textContent = "";

  try {
    // Step 1: Get current user via GraphQL (no HTML parsing needed)
    syncStatus.textContent = "Checking login...";
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
      syncStatus.textContent = "Not logged in — please log in to LeetCode first.";
      syncBtn.disabled = false;
      syncBtn.textContent = "Sync my LeetCode profile";
      return;
    }
    const username = userStatus.username;
    console.log(`[LeetCode Tracker Popup] Detected username: ${username}`);

    // Step 2: Get solve stats via GraphQL
    syncStatus.textContent = `Fetching stats for ${username}...`;
    const graphqlResp = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        query: `
          query getUserProfile($username: String!) {
            matchedUser(username: $username) {
              submitStats {
                acSubmissionNum {
                  difficulty
                  count
                  submissions
                }
              }
            }
          }`,
        variables: { username },
      }),
    });
    const graphqlData = await graphqlResp.json();
    const stats = graphqlData?.data?.matchedUser?.submitStats?.acSubmissionNum;

    if (!stats) {
      syncStatus.textContent = "Could not fetch solve stats.";
      syncBtn.disabled = false;
      syncBtn.textContent = "Sync my LeetCode profile";
      return;
    }

    // Step 3: Get recent accepted submissions
    syncStatus.textContent = "Fetching recent submissions...";
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

    // Step 4: Merge into storage
    syncStatus.textContent = "Saving to storage...";
    await new Promise((resolve) => {
      chrome.storage.local.get({ solves: [] }, (data) => {
        const existing = data.solves;
        const existingKeys = new Set(
          existing.map((s) => `${s.problemName}|${s.date?.slice(0, 10)}`)
        );

        // Load company dataset for auto-tagging
        let companyDataset = null;
        try {
          // Can't fetch chrome.runtime.getURL from popup, so skip for now
        } catch (e) {}

        let added = 0;
        for (const sub of recentSubs) {
          const date = new Date(parseInt(sub.timestamp) * 1000).toISOString();
          const key = `${sub.title}|${date.slice(0, 10)}`;
          if (existingKeys.has(key)) continue;

          existing.push({
            problemName: sub.title,
            difficulty: null, // unknown from API
            timeSpentSeconds: 0, // unknown from API
            date,
            url: `https://leetcode.com/problems/${sub.titleSlug}/`,
            slug: sub.titleSlug,
            companies: [],
          });
          existingKeys.add(key);
          added++;
        }

        chrome.storage.local.set({ solves: existing }, () => {
          console.log(`[LeetCode Tracker Popup] Synced ${added} new solve(s) from profile`);
          syncStatus.textContent = `Synced ${added} new solve(s). Total: ${existing.length}`;
          syncBtn.disabled = false;
          syncBtn.textContent = "Sync my LeetCode profile";
          if (added > 0) render();
          resolve();
        });
      });
    });
  } catch (err) {
    console.error("[LeetCode Tracker Popup] Sync error:", err);
    syncStatus.textContent = `Sync failed: ${err.message}`;
    syncBtn.disabled = false;
    syncBtn.textContent = "Sync my LeetCode profile";
  }
}

document.getElementById("syncBtn").addEventListener("click", syncProfile);

/* ---- Export / Import / Clear ---- */

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

document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const imported = JSON.parse(evt.target.result);
      if (!Array.isArray(imported)) {
        alert("Invalid backup file — expected a JSON array of solve records.");
        return;
      }

      // Validate each record has required fields
      const valid = imported.filter((r) => r.problemName && r.date);
      if (valid.length === 0) {
        alert("No valid solve records found in the file.");
        return;
      }

      const confirmed = window.confirm(
        `Import ${valid.length} solve(s)? This will ADD to your existing data (no duplicates by name+date).`
      );
      if (!confirmed) return;

      chrome.storage.local.get({ solves: [] }, (data) => {
        const existing = data.solves;
        const existingKeys = new Set(
          existing.map((s) => `${s.problemName}|${s.date.slice(0, 10)}`)
        );

        let added = 0;
        for (const record of valid) {
          const key = `${record.problemName}|${record.date.slice(0, 10)}`;
          if (!existingKeys.has(key)) {
            existing.push(record);
            existingKeys.add(key);
            added++;
          }
        }

        chrome.storage.local.set({ solves: existing }, () => {
          console.log(`[LeetCode Tracker Popup] Imported ${added} new solve(s) (${valid.length - added} duplicates skipped)`);
          alert(`Imported ${added} new solve(s).${added < valid.length ? ` ${valid.length - added} duplicates were skipped.` : ""}`);
          window.location.reload();
        });
      });
    } catch (err) {
      alert(`Failed to parse backup file: ${err.message}`);
    }
  };
  reader.readAsText(file);
  // Reset input so the same file can be re-imported
  e.target.value = "";
});

document.getElementById("clearBtn").addEventListener("click", () => {
  const confirmed = window.confirm(
    "Are you sure you want to delete ALL solve stats? This cannot be undone."
  );
  if (!confirmed) return;

  chrome.storage.local.set({ solves: [] }, () => {
    if (chrome.runtime.lastError) {
      console.error("[LeetCode Tracker Popup] Clear error:", chrome.runtime.lastError);
      return;
    }
    console.log("[LeetCode Tracker Popup] Stats cleared");
    window.location.reload();
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
