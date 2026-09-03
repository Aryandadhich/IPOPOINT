import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiRegister } from '../api/api.js'

function checkStrength(v) {
  let score = 0
  if (/^.{8,}$/.test(v))  score++
  if (/[A-Z]/.test(v))    score++
  if (/[0-9]/.test(v))    score++
  if (v.length > 12 && /[^A-Za-z0-9]/.test(v)) score = 4
  return score
}

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Strong', 'Very Strong']
const STRENGTH_COLORS = ['', '#ef4444', '#f59e0b', '#2ea87e', '#2ea87e']

export default function Register() {
  const { user, saveSession } = useAuth()
  const navigate = useNavigate()

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [terms, setTerms]       = useState(false)
  const [showPwd, setShowPwd]   = useState(false)
  const [showCfm, setShowCfm]   = useState(false)
  const [errors, setErrors]     = useState({})
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)

  useEffect(() => {
    if (user) navigate('/tracker', { replace: true })
  }, [user])

  const strength = checkStrength(password)

  function validate() {
    const e = {}
    if (!name || name.trim().length < 2)          e.name = 'Name must be at least 2 characters'
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email'
    if (!password || password.length < 8)         e.password = 'At least 8 characters required'
    else if (!/[A-Z]/.test(password))             e.password = 'At least one uppercase letter required'
    else if (!/[0-9]/.test(password))             e.password = 'At least one number required'
    if (password && confirm !== password)         e.confirm  = 'Passwords do not match'
    if (!terms)                                   e.terms    = 'You must agree to the Terms of Service'
    return e
  }

  function setField(field, value) {
    if (field === 'name')     setName(value)
    if (field === 'email')    setEmail(value)
    if (field === 'password') setPassword(value)
    if (field === 'confirm')  setConfirm(value)
    setErrors(p => ({ ...p, [field]: '' }))
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setLoading(true)
    setErrors({})
    try {
      const { ok, data } = await apiRegister(name.trim(), email, password)
      if (!ok) {
        setErrors(data.errors || { general: 'Registration failed' })
        return
      }
      saveSession(data.token, data.user)
      setSuccess(true)
      setTimeout(() => navigate('/tracker'), 1500)
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
            <h2>Account created!</h2>
            <p>Welcome to IPOPoint. Redirecting...</p>
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
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Start tracking IPOs for free</p>

        {errors.general && <div className="form-err-banner">{errors.general}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className={`field-group${errors.name ? ' has-err' : ''}`}>
            <label>Full Name</label>
            <input type="text" value={name} placeholder="Aryan Dadheech"
              onChange={e => setField('name', e.target.value)} />
            {errors.name && <span className="field-err">{errors.name}</span>}
          </div>

          <div className={`field-group${errors.email ? ' has-err' : ''}`}>
            <label>Email</label>
            <input type="email" value={email} placeholder="you@example.com" autoComplete="email"
              onChange={e => setField('email', e.target.value)} />
            {errors.email && <span className="field-err">{errors.email}</span>}
          </div>

          <div className={`field-group${errors.password ? ' has-err' : ''}`}>
            <label>Password</label>
            <div className="pwd-wrap">
              <input type={showPwd ? 'text' : 'password'} value={password} placeholder="Min 8 chars, 1 uppercase, 1 number"
                onChange={e => setField('password', e.target.value)} />
              <button type="button" className="pwd-toggle" onClick={() => setShowPwd(s => !s)}>
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
            {password.length > 0 && (
              <div className="strength-wrap">
                <div className="strength-bars">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="sbar"
                      style={{ background: i <= strength ? STRENGTH_COLORS[strength] : 'var(--border)' }} />
                  ))}
                </div>
                <span className="strength-label" style={{ color: STRENGTH_COLORS[strength] || 'var(--muted)' }}>
                  {STRENGTH_LABELS[strength]}
                </span>
              </div>
            )}
            {password.length > 0 && (
              <div className="pwd-reqs">
                <span className={password.length >= 8 ? 'met' : ''}>✓ 8+ characters</span>
                <span className={/[A-Z]/.test(password) ? 'met' : ''}>✓ Uppercase</span>
                <span className={/[0-9]/.test(password) ? 'met' : ''}>✓ Number</span>
              </div>
            )}
            {errors.password && <span className="field-err">{errors.password}</span>}
          </div>

          <div className={`field-group${errors.confirm ? ' has-err' : ''}`}>
            <label>Confirm Password</label>
            <div className="pwd-wrap">
              <input type={showCfm ? 'text' : 'password'} value={confirm} placeholder="Repeat password"
                onChange={e => setField('confirm', e.target.value)} />
              <button type="button" className="pwd-toggle" onClick={() => setShowCfm(s => !s)}>
                {showCfm ? '🙈' : '👁'}
              </button>
            </div>
            {errors.confirm && <span className="field-err">{errors.confirm}</span>}
          </div>

          <div className={`field-group field-check${errors.terms ? ' has-err' : ''}`}>
            <label className="check-label">
              <input type="checkbox" checked={terms} onChange={e => { setTerms(e.target.checked); setErrors(p => ({ ...p, terms: '' })) }} />
              I agree to the Terms of Service
            </label>
            {errors.terms && <span className="field-err">{errors.terms}</span>}
          </div>

          <button type="submit" className="btn-auth" disabled={loading}>
            {loading ? <><span className="spin" /> Creating account...</> : 'Create Account →'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Log in</Link>
        </div>
      </div>
    </div>
  )
}
