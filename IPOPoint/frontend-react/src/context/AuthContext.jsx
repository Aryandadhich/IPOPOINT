import { createContext, useContext, useState, useEffect } from 'react'
import { apiMe } from '../api/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ipo_user') || 'null') }
    catch { return null }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ipo_token')
    if (!token) { setLoading(false); return }
    apiMe().then(({ ok, data }) => {
      if (ok && data) setUser(data)
      else clearSession()
    }).catch(() => clearSession()).finally(() => setLoading(false))
  }, [])

  function saveSession(token, userData) {
    localStorage.setItem('ipo_token', token)
    localStorage.setItem('ipo_user', JSON.stringify(userData))
    setUser(userData)
  }

  function clearSession() {
    localStorage.removeItem('ipo_token')
    localStorage.removeItem('ipo_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, saveSession, clearSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
