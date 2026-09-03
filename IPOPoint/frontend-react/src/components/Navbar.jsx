import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { apiLogout } from '../api/api.js'

export default function Navbar() {
  const { user, clearSession } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleLogout() {
    await apiLogout()
    clearSession()
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <div className="nav-inner">
        {/* Logo */}
        <Link to="/" className="nav-logo">
          <div className="logo-dot" />
          <span className="logo-txt">IPO<em>Point</em></span>
        </Link>

        {/* Nav links */}
        <div className="nav-links">
          <Link to="/" className={location.pathname === '/' ? 'act' : ''}>Live IPOs</Link>
          <Link to="/" className="">Upcoming</Link>
          <Link to="/" className="">GMP</Link>
          <Link to="/" className="">Allotment</Link>
        </div>

        {/* Right side */}
        <div className="nav-r">
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>

          {user ? (
            <>
              <div className="user-chip">
                <div className="avatar">{user.name[0].toUpperCase()}</div>
                <span>{user.name}</span>
              </div>
              <Link to="/tracker"><button className="btn-login">My Tracker</button></Link>
              <button className="btn-logout-nav" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login"><button className="btn-login">Login</button></Link>
              <Link to="/register"><button className="btn-start">Get Started</button></Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
