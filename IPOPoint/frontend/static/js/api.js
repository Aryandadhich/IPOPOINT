/**
 * api.js — all fetch() calls in one place
 *
 * Every function returns the parsed JSON body (or throws on network error).
 * HTTP error responses are returned as-is (caller checks r.ok if needed).
 */

const BASE = "";  // same origin — Flask serves both API and frontend

function authHeaders() {
  const token = localStorage.getItem("ipo_token") || "";
  return {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function apiRegister(name, email, password) {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

export async function apiLogin(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

export async function apiLogout() {
  await fetch(`${BASE}/api/auth/logout`, { method: "POST" });
}

export async function apiMe() {
  const r = await fetch(`${BASE}/api/auth/me`, { headers: authHeaders() });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null };
}

// ── Live IPOs ─────────────────────────────────────────────────────────────────

export async function apiLiveIPOs() {
  const r = await fetch(`${BASE}/api/live-ipos`);
  return { ok: r.ok, data: await r.json() };
}

// ── Tracker CRUD ──────────────────────────────────────────────────────────────

export async function apiListIPOs() {
  const r = await fetch(`${BASE}/api/ipos`, { headers: authHeaders() });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null };
}

export async function apiAddIPO(name) {
  const r = await fetch(`${BASE}/api/ipos`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

export async function apiUpdateIPO(id, fields) {
  const r = await fetch(`${BASE}/api/ipos/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  return { ok: r.ok, data: await r.json() };
}

export async function apiRefreshIPO(id) {
  const r = await fetch(`${BASE}/api/ipos/${id}/refresh`, {
    method: "POST",
    headers: authHeaders(),
  });
  return { ok: r.ok, data: await r.json() };
}

export async function apiRefreshAll() {
  const r = await fetch(`${BASE}/api/refresh-all`, {
    method: "POST",
    headers: authHeaders(),
  });
  return { ok: r.ok, data: await r.json() };
}

export async function apiDeleteIPO(id) {
  await fetch(`${BASE}/api/ipos/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function apiStats() {
  const r = await fetch(`${BASE}/api/stats`, { headers: authHeaders() });
  return { ok: r.ok, data: r.ok ? await r.json() : null };
}

export async function apiExport() {
  return fetch(`${BASE}/api/export`, { headers: authHeaders() });
}
