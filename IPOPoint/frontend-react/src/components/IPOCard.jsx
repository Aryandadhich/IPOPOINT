import { useToast } from '../context/ToastContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { apiAddIPO } from '../api/api.js'

const GRAD_PALETTES = [
  ['#2ea87e', '#27956e'], ['#4878d0', '#3460b8'],
  ['#c4682a', '#a5501a'], ['#7b5cd4', '#6344b8'],
  ['#c8932a', '#a87510'], ['#2a8ac8', '#1a6aaa'],
]

function logoGrad(name) {
  const idx = (name.charCodeAt(0) || 0) % GRAD_PALETTES.length
  return GRAD_PALETTES[idx]
}

function initials(n) {
  return n.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || 'IP'
}

function parseDate(s) {
  const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
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

export default function IPOCard({ ipo, onTrack }) {
  const toast = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [c1, c2] = logoGrad(ipo.name)
  const ini = initials(ipo.name)
  const gmp = ipo.gmp_num || 0
  const gmpCls = gmp > 0 ? 'gp' : gmp < 0 ? 'gn' : 'gm'
  const gmpTxt = ipo.gmp ? (gmp > 0 ? `+${ipo.gmp}` : ipo.gmp) : '—'

  const score = Math.min(100, Math.max(0, 50 + gmp))
  const scoreColor = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)'
  const scoreTag = score >= 70 ? 'Strong Apply' : score >= 50 ? 'Consider' : 'Avoid'

  const closeD = parseDate(ipo.close_date)
  const diff = daysDiff(closeD)
  let cdText = null
  if (diff !== null) {
    if (diff < 0) cdText = <span className="cd-text">Closed</span>
    else if (diff === 0) cdText = <span className="cd-text">Closing Today!</span>
    else cdText = <span className="cd-text">Closes in <span>{diff}d</span></span>
  }

  async function handleTrack(e) {
    e.stopPropagation()
    if (!user) { navigate('/login'); return }
    if (onTrack) onTrack(ipo.name)
  }

  function handleApply(e) {
    e.stopPropagation()
    toast(`Opening broker to apply for ${ipo.name}`, 'inf')
  }

  return (
    <div className="ipo-card" onClick={() => onTrack && onTrack(ipo.name)}>
      <div className="card-top">
        <div className="c-logo" style={{ background: `linear-gradient(135deg,${c1},${c2})` }}>
          {ini}
        </div>
        <div className="c-badges">
          {ipo.status === 'open'     && <span className="badge b-open">● Open</span>}
          {ipo.status === 'upcoming' && <span className="badge b-up">◎ Upcoming</span>}
          {ipo.status === 'allotted' && <span className="badge b-allot">✓ Allotted</span>}
          {ipo.status === 'listed'   && <span className="badge b-allot">✓ Listed</span>}
          {gmp >= 30                 && <span className="badge b-hot">🔥 Hot</span>}
        </div>
      </div>

      <div className="c-name" title={ipo.name}>{ipo.name}</div>
      <div className="c-sub">₹{ipo.issue_price || '—'} issue price</div>

      <div className="score-row">
        <div className="score-bar-wrap">
          <div className="score-fill" style={{ width: `${score}%`, background: scoreColor }} />
        </div>
        <span className="score-num" style={{ color: scoreColor }}>{score}</span>
      </div>
      <div className="score-tag">{scoreTag}</div>

      <div className="meta-row">
        <div className="m-item"><div className="ml">Open</div><div className="mv">{ipo.open_date || '—'}</div></div>
        <div className="m-item"><div className="ml">Close</div><div className="mv">{ipo.close_date || '—'}</div></div>
        <div className="m-item"><div className="ml">GMP</div><div className={`mv ${gmpCls}`}>{gmpTxt}</div></div>
      </div>

      {cdText}

      <div className="c-actions">
        <button className="btn-apply" onClick={handleApply}>Apply Now</button>
        <button className="btn-track" onClick={handleTrack}>+ Track</button>
      </div>
    </div>
  )
}
