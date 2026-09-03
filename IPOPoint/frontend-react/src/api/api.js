import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('ipo_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function apiRegister(name, email, password) {
  try {
    const { data } = await api.post('/auth/register', { name, email, password })
    return { ok: true, data }
  } catch (e) {
    return { ok: false, data: e.response?.data || {} }
  }
}

export async function apiLogin(email, password) {
  try {
    const { data } = await api.post('/auth/login', { email, password })
    return { ok: true, data }
  } catch (e) {
    return { ok: false, data: e.response?.data || {} }
  }
}

export async function apiLogout() {
  try { await api.post('/auth/logout') } catch {}
}

export async function apiMe() {
  try {
    const { data } = await api.get('/auth/me')
    return { ok: true, data }
  } catch {
    return { ok: false, data: null }
  }
}

// ── Live IPOs ─────────────────────────────────────────────────────────────────

export async function apiLiveIPOs() {
  try {
    const { data } = await api.get('/live-ipos')
    return { ok: true, data }
  } catch (e) {
    return { ok: false, data: e.response?.data || {} }
  }
}

// ── Tracker CRUD ──────────────────────────────────────────────────────────────

export async function apiListIPOs() {
  try {
    const { data } = await api.get('/ipos')
    return { ok: true, data }
  } catch (e) {
    return { ok: false, status: e.response?.status, data: null }
  }
}

export async function apiAddIPO(name) {
  try {
    const { data } = await api.post('/ipos', { name })
    return { ok: true, data }
  } catch (e) {
    return { ok: false, data: e.response?.data || {} }
  }
}

export async function apiUpdateIPO(id, fields) {
  try {
    const { data } = await api.put(`/ipos/${id}`, fields)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, data: e.response?.data || {} }
  }
}

export async function apiRefreshIPO(id) {
  try {
    const { data } = await api.post(`/ipos/${id}/refresh`)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, data: e.response?.data || {} }
  }
}

export async function apiRefreshAll() {
  try {
    const { data } = await api.post('/refresh-all')
    return { ok: true, data }
  } catch (e) {
    return { ok: false, data: e.response?.data || {} }
  }
}

export async function apiDeleteIPO(id) {
  try {
    await api.delete(`/ipos/${id}`)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function apiStats() {
  try {
    const { data } = await api.get('/stats')
    return { ok: true, data }
  } catch {
    return { ok: false, data: null }
  }
}

export async function apiExport() {
  const token = localStorage.getItem('ipo_token')
  return fetch('/api/export', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}
