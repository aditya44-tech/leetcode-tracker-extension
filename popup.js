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

function companyLogoURL(company) {
  // Clearbit Logo API — free, no auth needed for this use case
  const slug = company.toLowerCase().replace(/\s+/g, "");
  return `https://logo.clearbit.com/${slug}.com`;
}

function companyLogoHTML(company, solveIndex) {
  const url = companyLogoURL(company);
  return `<span class="company-logo-pill" title="${escapeHtml(company)}" data-company="${escapeHtml(company)}" data-index="${solveIndex}">
    <img class="company-logo" src="${url}" alt="${escapeHtml(company)}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'" />
    <span class="company-logo-fallback" style="display:none">${escapeHtml(company.charAt(0))}</span>
    <button class="pill-remove" data-company="${escapeHtml(company)}" data-index="${solveIndex}" title="Remove">×</button>
  </span>`;
}

function companyLogoHTMLNoRemove(company) {
  const url = companyLogoURL(company);
  return `<img class="company-logo current-logo" src="${url}" alt="${escapeHtml(company)}" title="${escapeHtml(company)}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'" /><span class="company-logo-fallback current-fallback" style="display:none">${escapeHtml(company.charAt(0))}</span>`;
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

/* ---- Clear button ---- */

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
