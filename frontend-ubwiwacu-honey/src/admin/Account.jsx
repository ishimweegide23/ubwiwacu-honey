import { useState } from 'react'
import { KeyRound, Mail, ShieldCheck, ShieldOff, User } from 'lucide-react'
import { PageHead } from './AdminLayout.jsx'
import { Field, Notice, Spinner } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { adminApi } from '../lib/api.js'
import { formatDateTime } from '../lib/format.js'

const problem = (p) =>
  p.length < 8 ? 'Use at least 8 characters' : !/[A-Za-z]/.test(p) || !/[0-9]/.test(p) ? 'Use at least one letter and one number' : null

function ChangePassword() {
  const { startSession } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    const er = {}
    if (!f.current) er.current = 'Enter your current password'
    const p = problem(f.next)
    if (p) er.next = p
    if (f.next !== f.confirm) er.confirm = 'The passwords do not match'
    setErrors(er)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      const res = await adminApi.changePassword({ current_password: f.current, new_password: f.next })
      startSession(res.data) // new token; sessions on other devices end
      setF({ current: '', next: '', confirm: '' })
      toast.success('Password changed. Other devices have been signed out.')
    } catch (err) {
      const fe = err.fieldErrors || {}
      setErrors({ current: fe.current_password, next: fe.password, form: !fe.current_password && !fe.password ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={save} noValidate>
      <div className="panel-head">
        <div>
          <h2 className="row" style={{ gap: 8 }}>
            <KeyRound size={18} /> Change password
          </h2>
          <p className="panel-sub">Signing in elsewhere will stop working after you change it.</p>
        </div>
      </div>
      <div className="panel-body stack">
        {errors.form && <Notice variant="danger">{errors.form}</Notice>}
        <Field label="Current password" required error={errors.current}>
          {(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} />}
        </Field>
        <div className="form-grid">
          <Field label="New password" required error={errors.next} hint="8+ characters, a letter and a number">
            {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={f.next} onChange={set('next')} />}
          </Field>
          <Field label="Confirm new password" required error={errors.confirm}>
            {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} />}
          </Field>
        </div>
        <div>
          <button className="btn btn--primary" disabled={busy}>
            {busy && <Spinner />} Save new password
          </button>
        </div>
      </div>
    </form>
  )
}

function TwoFactor() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const on = user?.two_factor_enabled !== false
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = async (e) => {
    e.preventDefault()
    if (!password) return setError('Enter your password to confirm')
    setBusy(true)
    setError('')
    try {
      const res = await adminApi.setTwoFactor({ enabled: !on, password })
      setUser(res.data)
      setPassword('')
      toast.success(res.message)
    } catch (err) {
      setError(err.fieldErrors?.current_password || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={toggle} noValidate>
      <div className="panel-head">
        <div>
          <h2 className="row" style={{ gap: 8 }}>
            {on ? <ShieldCheck size={18} style={{ color: 'var(--success)' }} /> : <ShieldOff size={18} style={{ color: 'var(--warn)' }} />} Two-step sign-in
          </h2>
          <p className="panel-sub">After your password, we email a 6-digit code to {user?.email}.</p>
        </div>
        <span className={`badge ${on ? 'badge--success' : 'badge--warn'}`}>{on ? 'On' : 'Off'}</span>
      </div>
      <div className="panel-body stack">
        {on ? (
          <Notice variant="success" icon={ShieldCheck}>
            Your account is protected. Even if someone learns your password, they also need access to your email.
          </Notice>
        ) : (
          <Notice variant="danger" icon={ShieldOff}>
            Two-step sign-in is off. Anyone with your password can sign in. We recommend turning it on.
          </Notice>
        )}
        <Field label="Confirm with your password" required error={error}>
          {(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <div>
          <button className={`btn ${on ? 'btn--outline' : 'btn--primary'}`} disabled={busy}>
            {busy && <Spinner />} {on ? 'Turn off two-step sign-in' : 'Turn on two-step sign-in'}
          </button>
        </div>
      </div>
    </form>
  )
}

export default function Account() {
  const { user } = useAuth()
  return (
    <>
      <PageHead title="Account & security" subtitle="Your profile, password and sign-in protection." />
      <div className="two-col">
        <div className="stack" style={{ gap: 20 }}>
          <ChangePassword />
          <TwoFactor />
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2 className="row" style={{ gap: 8 }}>
              <User size={18} /> Profile
            </h2>
          </div>
          <div className="panel-body kv">
            <div>
              <span>Name</span>
              <strong>{user?.name}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong className="row" style={{ gap: 6 }}>
                <Mail size={14} /> {user?.email}
              </strong>
            </div>
            <div>
              <span>Role</span>
              <strong style={{ textTransform: 'capitalize' }}>{user?.role}</strong>
            </div>
            <div>
              <span>Last sign-in</span>
              <strong>{user?.last_login_at ? formatDateTime(user.last_login_at) : '—'}</strong>
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              Forgot your password? Use “Forgot password?” on the sign-in page; a code is sent to this email.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
