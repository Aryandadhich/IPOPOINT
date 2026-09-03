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

export default function GmpSidebar({ ipos }) {
  const top5 = [...ipos]
    .filter(x => (x.gmp_num || 0) > 0 && x.status === 'open')
    .sort((a, b) => (b.gmp_num || 0) - (a.gmp_num || 0))
    .slice(0, 5)

  const rankCls = ['r1', 'r2', 'r3', '', '']

  if (!top5.length) {
    return <p style={{ color: 'var(--muted)', fontSize: 12 }}>No GMP data yet</p>
  }

  return (
    <div id="sideGMP">
      {top5.map((ipo, i) => {
        const [c1, c2] = logoGrad(ipo.name)
        return (
          <div key={ipo.name} className="gmp-item">
            <span className={`gmp-rank ${rankCls[i]}`}>{i + 1}</span>
            <div className="gmp-logo" style={{ background: `linear-gradient(135deg,${c1},${c2})` }}>
              {initials(ipo.name)}
            </div>
            <div className="gmp-info">
              <div className="gmp-name">{ipo.name}</div>
              <div className="gmp-date">{ipo.close_date || '—'}</div>
            </div>
            <span className="gmp-val">+{ipo.gmp}</span>
          </div>
        )
      })}
    </div>
  )
}
