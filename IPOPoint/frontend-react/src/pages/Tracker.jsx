import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  apiListIPOs, apiAddIPO, apiUpdateIPO,
  apiRefreshIPO, apiRefreshAll, apiDeleteIPO,
  apiStats, apiExport,
} from '../api/api.js'
import { apiLogout } from '../api/api.js'

const APPLIED_OPTS   = ['', 'Applied', 'Not Applied']
const STATUS_OPTS    = ['', 'Allotted', 'Not Allotted', 'Pending']
const ALLOTMENT_OPTS = ['', 'Allotted', 'Not Allotted', 'Partial', 'Pending']

function gmpColor(g) {
  const n = parseFloat(g)
  if (isNaN(n)) return 'gm'
  return n > 0 ? 'gp' : n < 0 ? 'gn' : 'gm'
}

function EditSelect({ id, field, value, opts, onChange }) {
  return (
    <select
      className="editable"
      value={value || ''}
      onChange={e => onChange(id, field, e.target.value)}
    >
      {opts.map(o => <option key={o} value={o}>{o || '—'}</option>)}
    </select>
  )
}

function EditInput({ id, field, value, width, onBlur }) {
  const [val, setVal] = useState(value || '')
  // sync external value changes
  useEffect(() => { setVal(value || '') }, [value])
  return (
    <input
      className="editable"
      value={val}
      style={{ minWidth: width || 65 }}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onBlur(id, field, val)}
    />
  )
}

export default function Tracker() {
  const { user, clearSession } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [all, setAll]           = useState([])
  const [loading, setLoading]   = useState(true)
  const [stats, setStats]       = useState(null)
  const [filter, setFilter]     = useState('')
  const [addOpen, setAddOpen]   = useState(false)
  const [addName, setAddName]   = useState('')
  const [addErr, setAddErr]     = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [refreshingAll, setRefreshingAll] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { ok, status, data } = await apiListIPOs()
    if (status === 401) { navigate('/login'); return }
    if (!ok || !data)   { toast('Could not load data', 'err'); setLoading(false); return }
    setAll(data)
    setLoading(false)
    loadStats()
  }

  async function loadStats() {
    const { ok, data } = await apiStats()
    if (ok && data) setStats(data)
  }

  async function handleLogout() {
    await apiLogout()
    clearSession()
    navigate('/login')
  }

  async function saveField(id, field, value) {
    const { ok, data } = await apiUpdateIPO(id, { [field]: value })
    if (!ok) { toast('Save failed', 'err'); return }
    setAll(prev => prev.map(x => x.id === id ? data : x))
  }

  async function handleAdd() {
    const name = addName.trim()
    if (!name) { setAddErr('Please enter an IPO name'); return }
    setAddLoading(true)
    setAddErr('')
    const { ok, data } = await apiAddIPO(name)
    if (!ok) { setAddErr(data.error || 'Error adding IPO'); setAddLoading(false); return }
    setAll(prev => [data, ...prev])
    setAddOpen(false)
    setAddName('')
    toast(`✓ "${data.name}" added`, 'ok')
    setAddLoading(false)
    loadStats()
  }

  async function handleRefresh(id) {
    toast('Refreshing...', 'inf')
    const { ok, data } = await apiRefreshIPO(id)
    if (!ok) { toast(data.error || 'Error', 'err'); return }
    setAll(prev => prev.map(x => x.id === id ? data : x))
    toast('✓ Updated', 'ok')
  }

  async function handleDelete(id, name) {
    if (!confirm(`Remove "${name}"?`)) return
    await apiDeleteIPO(id)
    setAll(prev => prev.filter(x => x.id !== id))
    toast('Removed', 'ok')
    loadStats()
  }

  async function handleRefreshAll() {
    setRefreshingAll(true)
    const { ok, data } = await apiRefreshAll()
    if (!ok) { toast(data?.error || 'Error', 'err'); setRefreshingAll(false); return }
    await load()
    toast(`✓ ${data.updated} IPOs refreshed`, 'ok')
    setRefreshingAll(false)
  }

  async function handleExport() {
    const r = await apiExport()
    if (r.status === 401) { navigate('/login'); return }
    if (!r.ok) { toast('Export failed', 'err'); return }
    const blob = await r.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'IPO_Tracker.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = all.filter(x => x.name.toLowerCase().includes(filter.toLowerCase()))

  const appliedCount   = all.filter(x => x.acc1_applied === 'Applied' || x.acc2_applied === 'Applied' || x.acc3_applied === 'Applied').length
  const allottedCount  = all.filter(x => x.acc1_status  === 'Allotted' || x.acc2_status === 'Allotted' || x.acc3_status === 'Allotted').length
  const notAllotted    = all.filter(x => x.acc1_status  === 'Not Allotted' || x.acc2_status === 'Not Allotted' || x.acc3_status === 'Not Allotted').length

  return (
    <div className="page-tracker">
      {/* Tracker Header */}
      <header className="tracker-header">
        <div className="tracker-header-inner">
          <div className="th-left">
            <a href="/" className="nav-logo"><span className="logo-mark">IPO</span><span className="logo-point">Point</span></a>
          </div>
          <div className="th-center">
            <h1>My IPO Tracker</h1>
            <span className="count-badge" id="countBadge">{all.length} IPO{all.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="th-right">
            <div className="user-pill">
              <div className="user-avatar">{user?.name?.[0]?.toUpperCase()}</div>
              <span className="user-name">{user?.name}</span>
            </div>
            <button className="btn-logout" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="tracker-stats">
        <div className="ts-item"><span className="ts-val" id="sTotal">{all.length}</span><span className="ts-label">Total</span></div>
        <div className="ts-item"><span className="ts-val">{appliedCount}</span><span className="ts-label">Applied</span></div>
        <div className="ts-item"><span className="ts-val">{allottedCount}</span><span className="ts-label">Allotted</span></div>
        <div className="ts-item"><span className="ts-val">{notAllotted}</span><span className="ts-label">Not Allotted</span></div>
        {stats && (
          <>
            <div className="ts-item">
              <span className="ts-val" style={{ color: stats.total_gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {stats.total_gain >= 0 ? '₹+' : '₹'}{Math.abs(stats.total_gain).toLocaleString('en-IN')}
              </span>
              <span className="ts-label">Total Gain</span>
            </div>
            <div className="ts-item">
              <span className="ts-val">{stats.win_rate}%</span>
              <span className="ts-label">Win Rate</span>
            </div>
          </>
        )}
      </div>

      {/* Toolbar */}
      <div className="tracker-toolbar">
        <input
          className="filter-inp"
          placeholder="Filter IPOs..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <div className="toolbar-actions">
          <button className="btn-add" onClick={() => { setAddOpen(true); setAddName(''); setAddErr('') }}>
            + Add IPO
          </button>
          <button className="btn-refresh-all" onClick={handleRefreshAll} disabled={refreshingAll}>
            {refreshingAll ? <><span className="spin" /></> : '↻ Refresh All'}
          </button>
          <button className="btn-export" onClick={handleExport}>⬇ Export</button>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        {loading ? (
          <div className="loading-state" style={{ padding: 40 }}>
            <div className="skel" /><div className="skel" /><div className="skel" />
          </div>
        ) : (
          <table className="tracker-table">
            <thead>
              <tr>
                <th>#</th>
                <th>IPO Name</th>
                <th>Open</th>
                <th>Close</th>
                <th>Allotment</th>
                <th>Issue ₹</th>
                <th>GMP</th>
                <th>S Applied</th>
                <th>S Status</th>
                <th>A Applied</th>
                <th>A Status</th>
                <th>R Applied</th>
                <th>R Status</th>
                <th>Lots</th>
                <th>Allot Status</th>
                <th>Shares</th>
                <th>Listing ₹</th>
                <th>Gain</th>
                <th>Notes</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="tbody">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={21}>
                    <div className="empty">
                      <div className="ei">📋</div>
                      <p>No IPOs yet</p>
                      <small>Click "+ Add IPO" to get started</small>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((ipo, i) => (
                <tr key={ipo.id}>
                  <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                  <td className="ipo-name-cell" title={ipo.name}>{ipo.name}</td>
                  <td>{ipo.open_date || '—'}</td>
                  <td>{ipo.close_date || '—'}</td>
                  <td>{ipo.allotment_date || '—'}</td>
                  <td>{ipo.issue_price ? `₹${ipo.issue_price}` : '—'}</td>
                  <td><span className={gmpColor(ipo.gmp)}>{ipo.gmp ? (parseFloat(ipo.gmp) > 0 ? `+${ipo.gmp}` : ipo.gmp) : '—'}</span></td>
                  <td><EditSelect id={ipo.id} field="acc1_applied" value={ipo.acc1_applied} opts={APPLIED_OPTS}   onChange={saveField} /></td>
                  <td><EditSelect id={ipo.id} field="acc1_status"  value={ipo.acc1_status}  opts={STATUS_OPTS}    onChange={saveField} /></td>
                  <td><EditSelect id={ipo.id} field="acc2_applied" value={ipo.acc2_applied} opts={APPLIED_OPTS}   onChange={saveField} /></td>
                  <td><EditSelect id={ipo.id} field="acc2_status"  value={ipo.acc2_status}  opts={STATUS_OPTS}    onChange={saveField} /></td>
                  <td><EditSelect id={ipo.id} field="acc3_applied" value={ipo.acc3_applied} opts={APPLIED_OPTS}   onChange={saveField} /></td>
                  <td><EditSelect id={ipo.id} field="acc3_status"  value={ipo.acc3_status}  opts={STATUS_OPTS}    onChange={saveField} /></td>
                  <td><EditInput  id={ipo.id} field="total_lots"       value={ipo.total_lots}       width={55} onBlur={saveField} /></td>
                  <td><EditSelect id={ipo.id} field="allotment_status" value={ipo.allotment_status} opts={ALLOTMENT_OPTS} onChange={saveField} /></td>
                  <td><EditInput  id={ipo.id} field="shares_allotted"  value={ipo.shares_allotted}  width={55} onBlur={saveField} /></td>
                  <td><EditInput  id={ipo.id} field="listing_price"    value={ipo.listing_price}    width={60} onBlur={saveField} /></td>
                  <td><EditInput  id={ipo.id} field="listing_gain"     value={ipo.listing_gain}     width={70} onBlur={saveField} /></td>
                  <td><EditInput  id={ipo.id} field="notes"            value={ipo.notes}            width={90} onBlur={saveField} /></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{ipo.updated_at || '—'}</td>
                  <td>
                    <div className="tbl-actions">
                      <button className="btn-ghost" onClick={() => handleRefresh(ipo.id)} title="Refresh">↻</button>
                      <button className="btn-del"   onClick={() => handleDelete(ipo.id, ipo.name)} title="Delete">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      {addOpen && (
        <div className="overlay open" onClick={e => { if (e.target.classList.contains('overlay')) setAddOpen(false) }}>
          <div className="modal">
            <div className="modal-h">
              <h3>Add IPO to Tracker</h3>
              <button className="modal-close" onClick={() => setAddOpen(false)}>✕</button>
            </div>
            <div className="modal-sub">Enter the IPO name — data will be fetched automatically</div>
            <input
              className="modal-inp"
              placeholder="e.g. Reliance IPO"
              value={addName}
              onChange={e => { setAddName(e.target.value); setAddErr('') }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
            {addErr && <div className="modal-err">{addErr}</div>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="btn-confirm" onClick={handleAdd} disabled={addLoading}>
                {addLoading ? <><span className="spin" /> Fetching...</> : 'Add & Fetch →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
