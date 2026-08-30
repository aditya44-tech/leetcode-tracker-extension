/**
 * popup.js — Reads solve records from chrome.storage.local and renders
 * the popup summary, average times table, and recent-solves list.
 */

document.addEventListener("DOMContentLoaded", () => {
  console.log("[LeetCode Tracker Popup] Loaded");

  chrome.storage.local.get({ solves: [] }, (data) => {
    if (chrome.runtime.lastError) {
      console.error("[LeetCode Tracker Popup] Storage error:", chrome.runtime.lastError);
      return;
    }

    const solves = data.solves;
    console.log(`[LeetCode Tracker Popup] ${solves.length} solve(s) found`);

    if (solves.length === 0) {
      document.getElementById("emptyState").classList.remove("hidden");
      return;
    }

    // ---- Show sections ----
    document.getElementById("summary").classList.remove("hidden");
    document.getElementById("averages").classList.remove("hidden");
    document.getElementById("recent").classList.remove("hidden");
    document.getElementById("clearBtn").classList.remove("hidden");

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
    for (const s of recent) {
      const tr = document.createElement("tr");
      const dateStr = s.date ? formatDate(s.date) : "—";
      const diff = s.difficulty || "Medium";
      tr.innerHTML = `
        <td class="problem-name" title="${escapeHtml(s.problemName)}">${escapeHtml(s.problemName)}</td>
        <td><span class="diff-badge ${diff.toLowerCase()}">${diff}</span></td>
        <td class="time-col">${formatTime(s.timeSpentSeconds || 0)}</td>
        <td class="date-col">${dateStr}</td>`;
      recentTbody.appendChild(tr);
    }
  });

  // ---- Clear button ----
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
