/**
 * tracker.js — tracker table: CRUD, stats, filter, export
 */

import { toast }    from "./toast.js";
import { getToken, getUser, clearSession } from "./auth.js";
import {
  apiListIPOs, apiAddIPO, apiUpdateIPO,
  apiRefreshIPO, apiRefreshAll, apiDeleteIPO,
  apiStats, apiExport,
} from "./api.js";

// ── State ─────────────────────────────────────────────────────────────────────
let ALL = [];

// ── Auth guard ────────────────────────────────────────────────────────────────

async function checkAuth() {
  const token = getToken();
  if (!token) { window.location.href = "/login"; return false; }

  const { apiMe } = await import("./api.js");
  const { ok, data } = await apiMe();
  if (!ok) { window.location.href = "/login"; return false; }

  const avatarEl = document.getElementById("userAvatar");
  const nameEl   = document.getElementById("userName");
  if (avatarEl) avatarEl.textContent = data.name[0].toUpperCase();
  if (nameEl)   nameEl.textContent   = data.name;
  return true;
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  const { ok, status, data } = await apiListIPOs();
  if (status === 401) { window.location.href = "/login"; return; }
  if (!ok || !data)   { toast("Could not load data", "err"); return; }
  ALL = data;
  renderTable(ALL);
  updateStats(ALL);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function updateStats(ipos) {
  document.getElementById("sTotal").textContent     = ipos.length;
  document.getElementById("countBadge").textContent = `${ipos.length} IPO${ipos.length !== 1 ? "s" : ""}`;

  const ap = ipos.filter(x => x.acc1_applied === "Applied" || x.acc2_applied === "Applied" || x.acc3_applied === "Applied").length;
  const al = ipos.filter(x => x.acc1_status  === "Allotted" || x.acc2_status === "Allotted" || x.acc3_status === "Allotted").length;
  const na = ipos.filter(x => x.acc1_status  === "Not Allotted" || x.acc2_status === "Not Allotted" || x.acc3_status === "Not Allotted").length;

  document.getElementById("sApplied").textContent    = ap;
  document.getElementById("sAllotted").textContent   = al;
  document.getElementById("sNotAllotted").textContent= na;

  // Fetch server-side P&L stats
  apiStats().then(({ ok, data }) => {
    if (!ok || !data) return;
    const gain = data.total_gain;
    const ge   = document.getElementById("sGain");
    ge.textContent  = (gain >= 0 ? "₹+" : "₹") + Math.abs(gain).toLocaleString("en-IN");
    ge.style.color  = gain >= 0 ? "var(--green)" : "var(--red)";
    document.getElementById("sWin").textContent = data.win_rate + "%";
  }).catch(() => {});
}

// ── Render table ──────────────────────────────────────────────────────────────

function gmpHtml(g) {
  const n = parseFloat(g);
  if (isNaN(n)) return `<span class="gm">${g || "—"}</span>`;
  return `<span class="${n > 0 ? "gp" : n < 0 ? "gn" : "gm"}">${n > 0 ? "+" : ""}${g}</span>`;
}
function sel(field, id, val, opts) {
  return `<select class="editable" data-id="${id}" data-field="${field}">${opts.map(o => `<option ${val === o ? "selected" : ""}>${o || "—"}</option>`).join("")}</select>`;
}
function inp(field, id, val, w) {
  return `<input class="editable" value="${val || ""}" data-id="${id}" data-field="${field}" style="min-width:${w || 65}px"/>`;
}

function renderTable(ipos) {
  const tbody = document.getElementById("tbody");
  if (!ipos.length) {
    tbody.innerHTML = `<tr><td colspan="21"><div class="empty"><div class="ei">📋</div><p>No IPOs yet</p><small style="font-size:12px">Click "+ Add IPO" to get started</small></div></td></tr>`;
    return;
  }
  const A = ["","Applied","Not Applied"];
  const S = ["","Allotted","Not Allotted","Pending"];
  const O = ["","Allotted","Not Allotted","Partial","Pending"];

  tbody.innerHTML = ipos.map((ipo, i) => `
    <tr>
      <td style="color:var(--muted)">${i + 1}</td>
      <td class="ipo-name-cell" title="${ipo.name}">${ipo.name}</td>
      <td>${ipo.open_date || "—"}</td>
      <td>${ipo.close_date || "—"}</td>
      <td>${ipo.allotment_date || "—"}</td>
      <td>${ipo.issue_price ? "₹" + ipo.issue_price : "—"}</td>
      <td>${gmpHtml(ipo.gmp)}</td>
      <td>${sel("acc1_applied", ipo.id, ipo.acc1_applied, A)}</td>
      <td>${sel("acc1_status",  ipo.id, ipo.acc1_status,  S)}</td>
      <td>${sel("acc2_applied", ipo.id, ipo.acc2_applied, A)}</td>
      <td>${sel("acc2_status",  ipo.id, ipo.acc2_status,  S)}</td>
      <td>${sel("acc3_applied", ipo.id, ipo.acc3_applied, A)}</td>
      <td>${sel("acc3_status",  ipo.id, ipo.acc3_status,  S)}</td>
      <td>${inp("total_lots",       ipo.id, ipo.total_lots,       55)}</td>
      <td>${sel("allotment_status", ipo.id, ipo.allotment_status, O)}</td>
      <td>${inp("shares_allotted",  ipo.id, ipo.shares_allotted,  55)}</td>
      <td>${inp("listing_price",    ipo.id, ipo.listing_price,    60)}</td>
      <td>${inp("listing_gain",     ipo.id, ipo.listing_gain,     70)}</td>
      <td>${inp("notes",            ipo.id, ipo.notes,            90)}</td>
      <td style="font-size:11px;color:var(--muted)">${ipo.updated_at || "—"}</td>
      <td>
        <div class="tbl-actions">
          <button class="btn-ghost" data-action="refresh" data-id="${ipo.id}">↻</button>
          <button class="btn-del"   data-action="delete"  data-id="${ipo.id}" data-name="${ipo.name.replace(/"/g, "&quot;")}">✕</button>
        </div>
      </td>
    </tr>`).join("");
}

// ── Save field on blur/change (event delegation) ──────────────────────────────

async function saveField(id, field, value) {
  const { ok, data } = await apiUpdateIPO(id, { [field]: value });
  if (!ok) { toast("Save failed", "err"); return; }
  const i = ALL.findIndex(x => x.id === id);
  if (i >= 0) ALL[i] = data;
  updateStats(ALL);
}

// ── Add modal ─────────────────────────────────────────────────────────────────

function openAddModal() {
  const modal = document.getElementById("addModal");
  const inp   = document.getElementById("modalInp");
  const err   = document.getElementById("modalErr");
  if (!modal) return;
  if (inp) inp.value = "";
  if (err) err.style.display = "none";
  modal.classList.add("open");
  setTimeout(() => inp && inp.focus(), 80);
}
function closeAddModal() {
  const modal = document.getElementById("addModal");
  if (modal) modal.classList.remove("open");
}

async function addIPO() {
  const inp  = document.getElementById("modalInp");
  const err  = document.getElementById("modalErr");
  const btn  = document.getElementById("modalBtn");
  const name = inp ? inp.value.trim() : "";

  if (!name) {
    if (err) { err.textContent = "Please enter an IPO name"; err.style.display = "block"; }
    return;
  }
  btn.innerHTML = '<span class="spin"></span>Fetching...';
  btn.disabled  = true;
  if (err) err.style.display = "none";

  try {
    const { ok, data } = await apiAddIPO(name);
    if (!ok) {
      if (err) { err.textContent = data.error || "Error"; err.style.display = "block"; }
      return;
    }
    ALL.unshift(data);
    renderTable(ALL);
    updateStats(ALL);
    closeAddModal();
    toast(`✓ "${data.name}" added`, "ok");
  } catch {
    if (err) { err.textContent = "Network error"; err.style.display = "block"; }
  } finally {
    btn.innerHTML = "Add & Fetch →"; btn.disabled = false;
  }
}

// ── Table actions ─────────────────────────────────────────────────────────────

async function refreshIPO(id) {
  toast("Refreshing...", "inf");
  const { ok, data } = await apiRefreshIPO(id);
  if (!ok) { toast(data.error || "Error", "err"); return; }
  const i = ALL.findIndex(x => x.id === id);
  if (i >= 0) ALL[i] = data;
  renderTable(ALL); updateStats(ALL);
  toast("✓ Updated", "ok");
}

async function deleteIPO(id, name) {
  if (!confirm(`Remove "${name}"?`)) return;
  await apiDeleteIPO(id);
  ALL = ALL.filter(x => x.id !== id);
  renderTable(ALL); updateStats(ALL);
  toast("Removed", "ok");
}

async function refreshAll() {
  const btn = document.getElementById("refreshAllBtn");
  btn.innerHTML = '<span class="spin" style="border-top-color:var(--muted)"></span>';
  btn.disabled  = true;
  try {
    const { ok, data } = await apiRefreshAll();
    if (!ok) { toast(data.error || "Error", "err"); return; }
    await load();
    toast(`✓ ${data.updated} IPOs refreshed`, "ok");
  } finally {
    btn.innerHTML = "↻ Refresh All"; btn.disabled = false;
  }
}

async function exportExcel() {
  const r = await apiExport();
  if (r.status === 401) { window.location.href = "/login"; return; }
  if (!r.ok) { toast("Export failed", "err"); return; }
  const blob = await r.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "IPO_Tracker.xlsx"; a.click();
  URL.revokeObjectURL(url);
}

// ── Filter ────────────────────────────────────────────────────────────────────

function filterTable() {
  const q = document.getElementById("filterInp").value.toLowerCase();
  renderTable(ALL.filter(x => x.name.toLowerCase().includes(q)));
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const authed = await checkAuth();
  if (!authed) return;

  await load();

  // Header action buttons
  document.getElementById("addIpoBtn")    ?.addEventListener("click", openAddModal);
  document.getElementById("refreshAllBtn")?.addEventListener("click", refreshAll);
  document.getElementById("exportBtn")    ?.addEventListener("click", exportExcel);

  // Modal wiring
  document.getElementById("addModalClose") ?.addEventListener("click", closeAddModal);
  document.getElementById("addModalCancel")?.addEventListener("click", closeAddModal);
  document.getElementById("modalBtn")      ?.addEventListener("click", addIPO);
  document.getElementById("modalInp")      ?.addEventListener("keydown", e => { if (e.key === "Enter") addIPO(); });
  document.getElementById("addModal")      ?.addEventListener("click", e => { if (e.target.id === "addModal") closeAddModal(); });

  // Filter input
  document.getElementById("filterInp")?.addEventListener("input", filterTable);

  // Table event delegation (selects + inputs + action buttons)
  document.getElementById("tbody").addEventListener("change", async (e) => {
    const el = e.target.closest("[data-field]");
    if (el) await saveField(+el.dataset.id, el.dataset.field, el.value);
  });
  document.getElementById("tbody").addEventListener("blur", async (e) => {
    const el = e.target.closest("input[data-field]");
    if (el) await saveField(+el.dataset.id, el.dataset.field, el.value);
  }, true);
  document.getElementById("tbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id   = +btn.dataset.id;
    const name =  btn.dataset.name || "";
    if (btn.dataset.action === "refresh") await refreshIPO(id);
    if (btn.dataset.action === "delete")  await deleteIPO(id, name);
  });
});
