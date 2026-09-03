import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { apiLogin } from '../api/api.js'

export default function Login() {
  const { user, saveSession } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [errors, setErrors]     = useState({})
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)

  useEffect(() => {
    if (user) navigate('/tracker', { replace: true })
  }, [user])

  function validate() {
    const e = {}
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email'
    if (!password) e.password = 'Password is required'
    return e
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setLoading(true)
    setErrors({})
    try {
      const { ok, data } = await apiLogin(email, password)
      if (!ok) {
        setErrors(data.errors || { general: 'Invalid credentials' })
        return
      }
      saveSession(data.token, data.user)
      setSuccess(true)
      setTimeout(() => navigate('/tracker'), 1200)
    } catch {
      setErrors({ general: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="success-state">
            <div className="success-icon">✓</div>
            <h2>Welcome back!</h2>
            <p>Redirecting to your tracker...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-mark">IPO</span><span className="logo-point">Point</span>
        </div>
        <h1 className="auth-title">Log in to your account</h1>
        <p className="auth-sub">Track IPOs, monitor allotments, and calculate gains</p>

        {errors.general && (
          <div className="form-err-banner">{errors.general}</div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className={`field-group${errors.email ? ' has-err' : ''}`}>
            <label htmlFor="email">Email</label>
            <input
              id="email" type="email" autoComplete="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
              placeholder="you@example.com"
            />
            {errors.email && <span className="field-err">{errors.email}</span>}
          </div>

          <div className={`field-group${errors.password ? ' has-err' : ''}`}>
            <label htmlFor="password">Password</label>
            <div className="pwd-wrap">
              <input
                id="password" type={showPwd ? 'text' : 'password'} autoComplete="current-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
                placeholder="Your password"
              />
              <button type="button" className="pwd-toggle" onClick={() => setShowPwd(s => !s)}>
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
            {errors.password && <span className="field-err">{errors.password}</span>}
          </div>

          <button type="submit" className="btn-auth" disabled={loading}>
            {loading ? <><span className="spin" /> Logging in...</> : 'Log in'}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account? <Link to="/register">Register</Link>
        </div>
      </div>
    </div>
  )
}
