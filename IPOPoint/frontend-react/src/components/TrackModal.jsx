import { useState } from 'react'
import { apiAddIPO } from '../api/api.js'
import { useToast } from '../context/ToastContext.jsx'

export default function TrackModal({ isOpen, onClose, prefill = '', onAdded }) {
  const [name, setName] = useState(prefill)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  // Sync prefill when it changes from parent
  if (isOpen && name !== prefill && !loading) {
    // Only sync on open if user hasn't typed
  }

  async function handleAdd() {
    const val = name.trim()
    if (!val) { setError('Please enter an IPO name'); return }
    setLoading(true)
    setError('')
    try {
      const { ok, data } = await apiAddIPO(val)
      if (!ok) { setError(data.error || 'Error adding IPO'); return }
      toast(`✓ "${data.name}" added to tracker`, 'ok')
      onClose()
      if (onAdded) onAdded(data)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target.classList.contains('modal-overlay')) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <h3>Track IPO</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--muted)', marginBottom: 12, fontSize: 14 }}>
            Enter the IPO name to add it to your tracker
          </p>
          <input
            className="modal-input"
            placeholder="e.g. Reliance IPO"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          {error && <div className="modal-err">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleAdd} disabled={loading}>
            {loading ? <><span className="spin" /> Fetching...</> : 'Add & Fetch →'}
          </button>
        </div>
      </div>
    </div>
  )
}
