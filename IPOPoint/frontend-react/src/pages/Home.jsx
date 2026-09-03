import { useState, useEffect, useRef } from 'react'
import Navbar from '../components/Navbar.jsx'
import IPOCard from '../components/IPOCard.jsx'
import GmpSidebar from '../components/GmpSidebar.jsx'
import { apiLiveIPOs } from '../api/api.js'
import { useToast } from '../context/ToastContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { apiAddIPO } from '../api/api.js'

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

function parseDate(s) {
  if (!s) return null
  const parts = s.split('-')
  if (parts.length !== 2) return null
  const day = parseInt(parts[0], 10)
  const mon = MONTHS[parts[1]]
  if (isNaN(day) || mon === undefined) return null
  const d = new Date()
  d.setMonth(mon); d.setDate(day); d.setHours(0, 0, 0, 0)
  return d
}

function daysDiff(d) {
  if (!d) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((d - today) / 86400000)
}

export default function Home() {
  const [allIPOs, setAllIPOs]   = useState([])
  const [tab, setTab]           = useState('live')
  const [typeFilter, setTypeFilter] = useState('all')   // 'all' | 'mainboard' | 'sme'
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalPrefill, setModalPrefill] = useState('')
  const toast   = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { loadIPOs() }, [])

  async function loadIPOs() {
    setLoading(true)
    setError('')
    const { ok, data } = await apiLiveIPOs()
    if (!ok || data.error) {
      setError(data?.error || 'Could not load IPOs')
    } else {
      setAllIPOs(Array.isArray(data) ? data : (data.ipos || []))
    }
    setLoading(false)
  }

  function applyTypeFilter(list) {
    if (typeFilter === 'all') return list
    return list.filter(x => (x.ipo_type || 'mainboard') === typeFilter)
  }

  function getTabIPOs() {
    let list = []
    if (tab === 'live')     list = allIPOs.filter(x => x.status === 'open')
    else if (tab === 'upcoming') list = allIPOs.filter(x => x.status === 'upcoming')
    else if (tab === 'gmp') list = [...allIPOs]
        .filter(x => x.status === 'open' && (x.gmp_num || 0) > 0)
        .sort((a, b) => (b.gmp_num || 0) - (a.gmp_num || 0))
    else if (tab === 'allotted') list = allIPOs.filter(x => x.status === 'allotted' || x.status === 'listed')
    return applyTypeFilter(list)
  }

  const liveCount     = allIPOs.filter(x => x.status === 'open').length
  const upcomingCount = allIPOs.filter(x => x.status === 'upcoming').length
  const bestGMP       = Math.max(...allIPOs.map(x => x.gmp_num || 0).filter(n => n > 0), 0)
  const closingToday  = allIPOs.filter(x => {
    const diff = daysDiff(parseDate(x.close_date))
    return diff !== null && diff === 0
  }).length

  const tabCounts = {
    live:     liveCount,
    upcoming: upcomingCount,
    gmp:      allIPOs.filter(x => x.status === 'open' && (x.gmp_num || 0) > 0).length,
    allotted: allIPOs.filter(x => x.status === 'allotted' || x.status === 'listed').length,
  }

  function openTrackModal(name = '') {
    if (!user) { navigate('/login'); return }
    setModalPrefill(name)
    setModalOpen(true)
  }

  const tabIPOs = getTabIPOs()

  return (
    <div>
      <Navbar />

      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-eyebrow">
          <div className="dot" />
          Live data from InvestorGain
        </div>
        <h1>India's Cleanest<br /><em>IPO Discovery</em> Platform</h1>
        <p>Live GMP, allotment dates, and IPO scores — track every IPO across your demat accounts</p>
        <div className="hero-search">
          <input
            type="text"
            id="searchInp"
            placeholder="Search IPO to track — e.g. ESDS, Ola, Hyundai..."
            onKeyDown={e => { if (e.key === 'Enter') openTrackModal(e.target.value.trim()) }}
          />
          <button onClick={() => {
            const inp = document.getElementById('searchInp')
            openTrackModal(inp?.value.trim() || '')
          }}>
            + Track IPO
          </button>
        </div>
      </div>

      {/* ── STATS STRIP ── */}
      <div className="stats-strip">
        <div className="stat-item">
          <div className="si-icon">🔴</div>
          <div>
            <div className={`si-val${liveCount ? ' accent' : ''}`}>{liveCount || '—'}</div>
            <div className="si-lbl">Live Now</div>
          </div>
        </div>
        <div className="stat-item">
          <div className="si-icon">📅</div>
          <div>
            <div className="si-val yellow">{upcomingCount || '—'}</div>
            <div className="si-lbl">Upcoming</div>
          </div>
        </div>
        <div className="stat-item">
          <div className="si-icon">📈</div>
          <div>
            <div className="si-val green">{bestGMP ? `${bestGMP}%` : '—'}</div>
            <div className="si-lbl">Best GMP</div>
          </div>
        </div>
        <div className="stat-item">
          <div className="si-icon">⏰</div>
          <div>
            <div className="si-val red">{closingToday || '—'}</div>
            <div className="si-lbl">Closing Today</div>
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="tabs">
        {[
          { key: 'live',     label: 'Live IPOs'  },
          { key: 'upcoming', label: 'Upcoming'   },
          { key: 'gmp',      label: 'Top GMP'    },
          { key: 'allotted', label: 'Allotted'   },
        ].map(t => (
          <button
            key={t.key}
            className={`tab-btn${tab === t.key ? ' act' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="tab-ct">{tabCounts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div className="main-layout">

        {/* Cards column */}
        <div className="cards-col">
          <div className="sec-h">
            <div className="sec-title">
              {tab === 'live'     && <><em>Live</em> IPOs</>}
              {tab === 'upcoming' && <><em>Upcoming</em> IPOs</>}
              {tab === 'gmp'      && <>Top <em>GMP</em></>}
              {tab === 'allotted' && <><em>Allotted</em> IPOs</>}
            </div>
            <div className="sec-controls">
              <div className="type-filter">
                {[
                  { value: 'all',       label: 'All'       },
                  { value: 'mainboard', label: 'Mainboard' },
                  { value: 'sme',       label: 'SME'       },
                ].map(f => (
                  <button
                    key={f.value}
                    className={`type-btn${typeFilter === f.value ? ' act' : ''}`}
                    onClick={() => setTypeFilter(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button className="sec-refresh" onClick={loadIPOs}>↻ Refresh</button>
            </div>
          </div>

          {tab === 'allotted' && (
            <div className="allot-notice">
              <div className="ni">ℹ️</div>
              <div>
                <strong>Allotment data</strong> is sourced live from InvestorGain.com —
                IPOs that have been allotted appear here automatically. To check if{' '}
                <em>you personally</em> were allotted, visit the registrar's website.
                Auto-checker coming soon in <strong>IPOPoint Premium</strong>.
              </div>
            </div>
          )}

          {loading && (
            <div className="loading-state">
              <div className="skel" /><div className="skel" /><div className="skel" />
            </div>
          )}

          {!loading && error && (
            <div className="empty-state">
              <div className="ei">⚠️</div>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && tabIPOs.length === 0 && (
            <div className="empty-state">
              <div className="ei">📭</div>
              <p>No IPOs in this category right now</p>
            </div>
          )}

          {!loading && !error && tabIPOs.length > 0 && (
            <div className="grid">
              {tabIPOs.map(ipo => (
                <IPOCard key={ipo.name} ipo={ipo} onTrack={openTrackModal} />
              ))}
            </div>
          )}
        </div>

        {/* ── SIDEBAR ── */}
        <div className="sidebar">

          {/* Top GMP */}
          <div className="side-section">
            <div className="side-title">Top GMP Today</div>
            <GmpSidebar ipos={allIPOs} />
          </div>

          {/* Apply via Broker */}
          <div className="side-section">
            <div className="side-title">Apply via Broker</div>
            <div className="broker-row">
              <a className="broker-pill" href="https://zerodha.com/ipo/" target="_blank" rel="noopener noreferrer">
                <div className="broker-l">
                  <div className="broker-dot" style={{ background: '#387ed1' }} />
                  Zerodha
                </div>
                <div className="broker-arrow">↗</div>
              </a>
              <a className="broker-pill" href="https://groww.in/ipo/mainboard" target="_blank" rel="noopener noreferrer">
                <div className="broker-l">
                  <div className="broker-dot" style={{ background: '#00d09c' }} />
                  Groww
                </div>
                <div className="broker-arrow">↗</div>
              </a>
              <a className="broker-pill" href="https://dhan.co/ipo/" target="_blank" rel="noopener noreferrer">
                <div className="broker-l">
                  <div className="broker-dot" style={{ background: '#1a3de4' }} />
                  Dhan
                </div>
                <div className="broker-arrow">↗</div>
              </a>
            </div>
          </div>

          {/* Premium Card */}
          <div className="premium-card">
            <h3>IPOPoint Premium</h3>
            <p>Get alerts, auto allotment checker, and AI-based IPO scoring before you apply.</p>
            <div className="p-feats">
              <div className="p-feat">Real-Time GMP Alerts</div>
              <div className="p-feat">WhatsApp Notifications</div>
              <div className="p-feat">AI IPO Score</div>
              <div className="p-feat">Auto Allotment Checker</div>
            </div>
            <div className="p-price">₹99<span className="p-price-sub">/month</span></div>
            <button className="btn-upgrade" onClick={() => toast('Premium launching soon!', 'inf')}>
              Get Premium →
            </button>
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer>
        <div className="f-logo">
          <div className="f-logo-dot" />
          IPO<em>Point</em>
        </div>
        <p>Data sourced from InvestorGain.com · Not financial advice</p>
        <p className="f-copy">© 2025 IPOPoint</p>
      </footer>

      {/* ── TRACK MODAL ── */}
      {modalOpen && <TrackModal prefill={modalPrefill} onClose={() => setModalOpen(false)} />}
    </div>
  )
}

/* ── Inline Track Modal ── */
function TrackModal({ prefill, onClose }) {
  const [name, setName]       = useState(prefill || '')
  const [err, setErr]         = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  async function handleAdd() {
    const val = name.trim()
    if (!val) { setErr('Please enter an IPO name'); return }
    setLoading(true); setErr('')
    try {
      const { ok, data } = await apiAddIPO(val)
      if (!ok) { setErr(data.error || 'Error adding IPO'); return }
      toast(`✓ "${data.name}" added to tracker`, 'ok')
      onClose()
    } catch { setErr('Network error') }
    finally { setLoading(false) }
  }

  return (
    <div className="overlay open" onClick={e => { if (e.target.classList.contains('overlay')) onClose() }}>
      <div className="modal">
        <div className="modal-h">
          <h3>Track an IPO</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-sub">
          Enter the IPO name — dates and GMP will be auto-fetched and saved to your tracker.
        </div>
        <input
          className="modal-inp"
          type="text"
          placeholder="e.g. ESDS Software Solution"
          value={name}
          onChange={e => { setName(e.target.value); setErr('') }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          autoFocus
        />
        {err && <div className="modal-err">{err}</div>}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-confirm" onClick={handleAdd} disabled={loading}>
            {loading ? <><span className="spin" />Fetching...</> : 'Add & Fetch →'}
          </button>
        </div>
      </div>
    </div>
  )
}
