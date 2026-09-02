/**
 * home.js — homepage IPO cards logic
 * Handles live IPO loading, tabs, sidebar GMP, modal tracking.
 */

import { toast }    from "./toast.js";
import { getToken, getUser } from "./auth.js";
import { apiLiveIPOs, apiAddIPO } from "./api.js";

// ── State ─────────────────────────────────────────────────────────────────────
let ALL_IPOS = [];
let CUR_TAB  = "live";

const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDate(s) {
  if (!s) return null;
  const parts = s.split("-");
  if (parts.length !== 2) return null;
  const day = parseInt(parts[0], 10);
  const mon = MONTHS[parts[1]];
  if (isNaN(day) || mon === undefined) return null;
  const d = new Date();
  d.setMonth(mon); d.setDate(day); d.setHours(0,0,0,0);
  return d;
}
function today() { const t = new Date(); t.setHours(0,0,0,0); return t; }
function daysDiff(d) { return d ? Math.ceil((d - today()) / 86400000) : null; }

// ── Logo colour ───────────────────────────────────────────────────────────────

const GRAD_PALETTES = [
  ["#2ea87e","#27956e"], ["#4878d0","#3460b8"],
  ["#c4682a","#a5501a"], ["#7b5cd4","#6344b8"],
  ["#c8932a","#a87510"], ["#2a8ac8","#1a6aaa"],
];
function logoGrad(name) {
  const idx = name.charCodeAt(0) % GRAD_PALETTES.length;
  return GRAD_PALETTES[idx];
}
function initials(n) {
  return n.split(" ").slice(0,2).map(w => w[0] || "").join("").toUpperCase() || "IP";
}

// ── Load live IPOs ────────────────────────────────────────────────────────────

async function loadLiveIPOs() {
  document.getElementById("cardsArea").innerHTML = `
    <div class="loading-state">
      <div class="skel"></div><div class="skel"></div><div class="skel"></div>
    </div>`;

  const { ok, data } = await apiLiveIPOs();
  if (!ok || data.error) {
    document.getElementById("cardsArea").innerHTML = `
      <div class="empty-state"><div class="ei">⚠️</div><p>${data.error || "Could not load IPOs"}</p></div>`;
    return;
  }

  ALL_IPOS = Array.isArray(data) ? data : (data.ipos || []);
  updateStats();
  renderTab(CUR_TAB);
  renderSideGMP();
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function updateStats() {
  const live     = ALL_IPOS.filter(x => x.status === "open").length;
  const upcoming = ALL_IPOS.filter(x => x.status === "upcoming").length;
  const bestGMP  = Math.max(...ALL_IPOS.map(x => x.gmp_num || 0).filter(n => n > 0), 0);
  const closingToday = ALL_IPOS.filter(x => {
    const d = daysDiff(parseDate(x.close_date));
    return d !== null && d === 0;
  }).length;

  document.getElementById("sLive").textContent  = live      || "—";
  document.getElementById("sUp").textContent    = upcoming  || "—";
  document.getElementById("sGMP").textContent   = bestGMP   ? `${bestGMP}%` : "—";
  document.getElementById("sClose").textContent = closingToday || "—";

  document.getElementById("ct-live").textContent     = live;
  document.getElementById("ct-upcoming").textContent = upcoming;
  document.getElementById("ct-gmp").textContent      = ALL_IPOS.length;
  document.getElementById("ct-allotted").textContent = ALL_IPOS.filter(x => x.status === "allotted").length;
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchTab(tab) {
  CUR_TAB = tab;
  document.querySelectorAll(".tab").forEach(el => {
    el.classList.toggle("act", el.dataset.tab === tab);
  });
  renderTab(tab);
}

function renderTab(tab) {
  let ipos = [];
  const titleEl  = document.getElementById("secTitle");
  const noticeEl = document.getElementById("allotNotice");

  noticeEl.style.display = "none";

  if (tab === "live") {
    ipos = ALL_IPOS.filter(x => x.status === "open");
    titleEl.innerHTML = "<em>Live</em> IPOs";
  } else if (tab === "upcoming") {
    ipos = ALL_IPOS.filter(x => x.status === "upcoming");
    titleEl.innerHTML = "<em>Upcoming</em> IPOs";
  } else if (tab === "gmp") {
    ipos = [...ALL_IPOS].sort((a,b) => (b.gmp_num||0) - (a.gmp_num||0));
    titleEl.innerHTML = "Top <em>GMP</em>";
  } else if (tab === "allotted") {
    ipos = ALL_IPOS.filter(x => x.status === "allotted" || x.status === "listed");
    titleEl.innerHTML = "<em>Allotted</em> IPOs";
    noticeEl.style.display = "flex";
  }

  renderCards(ipos);
}

// ── Card rendering ────────────────────────────────────────────────────────────

function ipoCardHTML(ipo) {
  const [c1, c2] = logoGrad(ipo.name);
  const ini  = initials(ipo.name);
  const gmp  = ipo.gmp_num || 0;
  const gmpCls = gmp > 0 ? "gp" : gmp < 0 ? "gn" : "gm";
  const gmpTxt = ipo.gmp ? (gmp > 0 ? `+${ipo.gmp}` : ipo.gmp) : "—";

  // Score (fake based on GMP for now)
  const score = Math.min(100, Math.max(0, 50 + gmp));
  const scoreColor = score >= 70 ? "var(--green)" : score >= 50 ? "var(--yellow)" : "var(--red)";
  const scoreTag   = score >= 70 ? "Strong Apply" : score >= 50 ? "Consider" : "Avoid";

  // Badges
  let badges = "";
  if (ipo.status === "open")     badges += `<span class="badge b-open">● Open</span>`;
  if (ipo.status === "upcoming") badges += `<span class="badge b-up">◎ Upcoming</span>`;
  if (ipo.status === "allotted") badges += `<span class="badge b-allot">✓ Allotted</span>`;
  if (ipo.status === "listed")   badges += `<span class="badge b-allot">✓ Listed</span>`;
  if (gmp >= 30)                 badges += `<span class="badge b-hot">🔥 Hot</span>`;

  // Countdown
  const closeD = parseDate(ipo.close_date);
  const diff   = daysDiff(closeD);
  const cdText = diff === null    ? ""
               : diff < 0        ? "Closed"
               : diff === 0      ? "<span>Closing Today!</span>"
               : `Closes in <span>${diff}d</span>`;

  return `
  <div class="ipo-card" onclick="window.openDetail && window.openDetail('${ipo.name.replace(/'/g,"\\'")}')">
    <div class="card-top">
      <div class="c-logo" style="background:linear-gradient(135deg,${c1},${c2})">${ini}</div>
      <div class="c-badges">${badges}</div>
    </div>
    <div class="c-name" title="${ipo.name}">${ipo.name}</div>
    <div class="c-sub">₹${ipo.issue_price || "—"} issue price</div>
    <div class="score-row">
      <div class="score-bar-wrap"><div class="score-fill" style="width:${score}%;background:${scoreColor}"></div></div>
      <span class="score-num" style="color:${scoreColor}">${score}</span>
    </div>
    <div class="score-tag">${scoreTag}</div>
    <div class="meta-row">
      <div class="m-item"><div class="ml">Open</div><div class="mv">${ipo.open_date||"—"}</div></div>
      <div class="m-item"><div class="ml">Close</div><div class="mv">${ipo.close_date||"—"}</div></div>
      <div class="m-item"><div class="ml">GMP</div><div class="mv ${gmpCls}">${gmpTxt}</div></div>
    </div>
    ${cdText ? `<div class="cd-text">${cdText}</div>` : ""}
    <div class="c-actions">
      <button class="btn-apply" onclick="event.stopPropagation();window.applyNow && window.applyNow('${ipo.name.replace(/'/g,"\\'")}')">Apply Now</button>
      <button class="btn-track" onclick="event.stopPropagation();window.trackFromCard && window.trackFromCard('${ipo.name.replace(/'/g,"\\'")}')">+ Track</button>
    </div>
  </div>`;
}

function renderCards(ipos) {
  const area = document.getElementById("cardsArea");
  if (!ipos.length) {
    area.innerHTML = `<div class="empty-state"><div class="ei">📭</div><p>No IPOs in this category right now</p></div>`;
    return;
  }
  area.innerHTML = `<div class="grid">${ipos.map(ipoCardHTML).join("")}</div>`;
}

// ── Sidebar GMP ───────────────────────────────────────────────────────────────

function renderSideGMP() {
  const top5 = [...ALL_IPOS]
    .filter(x => (x.gmp_num || 0) > 0)
    .sort((a,b) => (b.gmp_num||0) - (a.gmp_num||0))
    .slice(0, 5);

  if (!top5.length) {
    document.getElementById("sideGMP").innerHTML = `<p style="color:var(--muted);font-size:12px">No GMP data yet</p>`;
    return;
  }

  const rankCls = ["r1","r2","r3","",""];
  document.getElementById("sideGMP").innerHTML = top5.map((ipo, i) => {
    const [c1, c2] = logoGrad(ipo.name);
    return `
    <div class="gmp-item" onclick="window.trackFromCard && window.trackFromCard('${ipo.name.replace(/'/g,"\\'")}')">
      <span class="gmp-rank ${rankCls[i]}">${i+1}</span>
      <div class="gmp-logo" style="background:linear-gradient(135deg,${c1},${c2})">${initials(ipo.name)}</div>
      <div class="gmp-info">
        <div class="gmp-name">${ipo.name}</div>
        <div class="gmp-date">${ipo.close_date || "—"}</div>
      </div>
      <span class="gmp-val">+${ipo.gmp}</span>
    </div>`;
  }).join("");
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openTrackModal(prefill = "") {
  const modal = document.getElementById("trackModal");
  const inp   = document.getElementById("modalInp");
  const err   = document.getElementById("modalErr");
  if (!modal) return;
  if (inp) { inp.value = prefill; }
  if (err) { err.style.display = "none"; }
  modal.classList.add("open");
  setTimeout(() => inp && inp.focus(), 80);
}

function closeModal() {
  const modal = document.getElementById("trackModal");
  if (modal) modal.classList.remove("open");
}

async function addToTracker() {
  const inp  = document.getElementById("modalInp");
  const err  = document.getElementById("modalErr");
  const btn  = document.getElementById("modalBtn");
  const name = inp ? inp.value.trim() : "";

  if (!name) {
    if (err) { err.textContent = "Please enter an IPO name"; err.style.display = "block"; }
    return;
  }

  if (!getToken()) { window.location.href = "/login"; return; }

  btn.innerHTML = '<span class="spin"></span>Fetching...';
  btn.disabled  = true;
  if (err) err.style.display = "none";

  try {
    const { ok, data } = await apiAddIPO(name);
    if (!ok) {
      if (err) { err.textContent = data.error || "Error"; err.style.display = "block"; }
      return;
    }
    closeModal();
    toast(`✓ "${data.name}" added to tracker`, "ok");
  } catch {
    if (err) { err.textContent = "Network error"; err.style.display = "block"; }
  } finally {
    btn.innerHTML = "Add & Fetch →"; btn.disabled = false;
  }
}

// ── Global action handlers (called from card HTML strings) ────────────────────
window.openDetail    = (name) => openTrackModal(name);
window.applyNow      = (name) => toast(`Opening broker to apply for ${name}`, "inf");
window.trackFromCard = (name) => openTrackModal(name);

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Tab buttons
  document.querySelectorAll(".tab").forEach(el => {
    el.addEventListener("click", () => switchTab(el.dataset.tab));
  });

  // Refresh button
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", loadLiveIPOs);

  // Search bar → open modal
  const searchBtn = document.getElementById("searchBtn");
  const searchInp = document.getElementById("searchInp");
  if (searchBtn) searchBtn.addEventListener("click", () => {
    const val = searchInp ? searchInp.value.trim() : "";
    openTrackModal(val);
  });
  if (searchInp) searchInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const val = searchInp.value.trim(); openTrackModal(val); }
  });

  // Modal buttons
  const modalCloseBtn  = document.getElementById("modalCloseBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalBtn       = document.getElementById("modalBtn");
  const modalInp       = document.getElementById("modalInp");
  const trackModal     = document.getElementById("trackModal");

  if (modalCloseBtn)  modalCloseBtn.addEventListener("click",  closeModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeModal);
  if (modalBtn)       modalBtn.addEventListener("click",       addToTracker);
  if (modalInp)       modalInp.addEventListener("keydown", e => { if (e.key === "Enter") addToTracker(); });
  if (trackModal)     trackModal.addEventListener("click", e => { if (e.target === trackModal) closeModal(); });

  // Upgrade button
  const upgradeBtn = document.getElementById("upgradeBtn");
  if (upgradeBtn) upgradeBtn.addEventListener("click", () => toast("Premium launching soon!", "inf"));

  // Allotment nav link
  const allotLink = document.getElementById("allotmentNavLink");
  if (allotLink) allotLink.addEventListener("click", (e) => { e.preventDefault(); toast("Allotment checker — coming soon!", "inf"); });

  // Load data
  loadLiveIPOs();
});
