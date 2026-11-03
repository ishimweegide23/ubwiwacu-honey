import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { Logo } from '../components/Brand.jsx'
import OtpInput from '../components/OtpInput.jsx'
import { Notice, Spinner } from '../components/ui.jsx'
import { adminHome } from '../components/ProtectedRoute.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { adminApi } from '../lib/api.js'
import { PHOTOS } from '../config/photos.js'
import { SITE } from '../config/site.js'
import '../admin.css'

const FEATURES = [
  { icon: ClipboardList, text: 'Orders from the shop, WhatsApp and walk-ins' },
  { icon: CreditCard, text: 'Verify Mobile Money and bank payments' },
  { icon: BarChart3, text: 'Stock, revenue and product reports' },
]

/** Turn API errors into a message staff can act on. */
function friendly(err) {
  if (err.status === 0) {
    return import.meta.env.DEV
      ? 'Cannot reach the server. Start the backend (npm run dev in backend-ubwiwacu-honey, port 5000) and try again.'
      : 'Cannot reach the server. Check your connection and try again.'
  }
  if (err.status === 401 && /email or password/i.test(err.message)) return 'Email or password is incorrect.'
  if (err.status === 403) return 'This account is suspended. Ask an administrator to re-activate it.'
  if (err.status === 422 || err.status === 400) return err.errors?.[0]?.message || err.message
  if (err.status >= 500 && err.status !== 503) return 'The server had a problem. Check that the database is running, then try again.'
  return err.message
}

const passwordProblem = (p) =>
  p.length < 8 ? 'Use at least 8 characters' : !/[A-Za-z]/.test(p) || !/[0-9]/.test(p) ? 'Use at least one letter and one number' : null

function PasswordField({ id, label, value, onChange, autoComplete, autoFocus, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-icon">
        <Lock size={18} />
        <input
          id={id}
          className="input"
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          required
        />
        <button type="button" className="input-toggle" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}

/** Counts down to zero once per second; returns [secondsLeft, restart(seconds)]. */
function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return undefined
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, setLeft]
}

const STEP_INFO = {
  password: { icon: Lock, title: 'Welcome back', text: 'Sign in with your staff account to continue.' },
  code: { icon: ShieldCheck, title: 'Check your email', text: 'For your security, enter the 6-digit code we sent to' },
  forgotEmail: { icon: KeyRound, title: 'Forgot password?', text: 'Enter your staff email (Gmail). We will send you a 6-digit code to reset your password.' },
  forgotCode: { icon: MailCheck, title: 'Enter the code', text: 'If an account matches, we sent a 6-digit code to' },
  forgotNew: { icon: Lock, title: 'Choose a new password', text: 'Use at least 8 characters with a letter and a number. Other devices will be signed out.' },
  done: { icon: CheckCircle2, title: 'Password updated', text: 'You can now sign in with your new password.' },
}

export default function Login() {
  const { login, verifyCode, status, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState(null) // { challenge, email_hint }
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useCountdown()

  if (status === 'authenticated' && step !== 'done') return <Navigate to={location.state?.from || adminHome(user?.role)} replace />

  const go = (next) => {
    setStep(next)
    setError('')
    setInfo('')
    setCode('')
  }

  const run = async (fn) => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await fn()
    } catch (err) {
      setError(friendly(err))
      if (err.status === 400) setCode('')
    } finally {
      setBusy(false)
    }
  }

  const enter = (u) => navigate(location.state?.from || adminHome(u?.role), { replace: true })

  const submitPassword = (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return setError('Enter your email and password.')
    run(async () => {
      const res = await login(email.trim(), password)
      if (res.twoFactor) {
        setChallenge(res.twoFactor)
        setCooldown(res.twoFactor.resend_after_seconds || 60)
        go('code')
      } else enter(res.user)
    })
  }

  const submitCode = (value = code) => {
    if (!/^\d{6}$/.test(value)) return setError('Enter the 6-digit code.')
    run(async () => enter(await verifyCode(challenge.challenge, value)))
  }

  const resendLogin = () =>
    run(async () => {
      const res = await adminApi.resendLogin({ challenge: challenge.challenge })
      setCooldown(res.data.resend_after_seconds || 60)
      setInfo('A new code is on its way.')
    })

  const sendReset = (e) => {
    e?.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.')
    run(async () => {
      await adminApi.forgotPassword({ email: email.trim() })
      setCooldown(60)
      if (step !== 'forgotCode') go('forgotCode')
      else setInfo('A new code is on its way.')
    })
  }

  const submitResetCode = (value = code) => {
    if (!/^\d{6}$/.test(value)) return setError('Enter the 6-digit code.')
    run(async () => {
      const res = await adminApi.verifyReset({ email: email.trim(), code: value })
      setResetToken(res.data.reset_token)
      go('forgotNew')
    })
  }

  const submitNewPassword = (e) => {
    e.preventDefault()
    const problem = passwordProblem(newPassword)
    if (problem) return setError(problem)
    if (newPassword !== confirm) return setError('The two passwords do not match.')
    run(async () => {
      await adminApi.resetPassword({ reset_token: resetToken, password: newPassword })
      setPassword('')
      setNewPassword('')
      setConfirm('')
      go('done')
    })
  }

  const S = STEP_INFO[step]
  const strength = newPassword ? Math.min(4, [newPassword.length >= 8, /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword), /\d/.test(newPassword), /[^A-Za-z0-9]/.test(newPassword) || newPassword.length >= 12].filter(Boolean).length) : 0

  return (
    <div className="login-page">
      <aside className="login-art" style={{ '--bg': `url(${PHOTOS.g500Display})` }}>
        <Logo small="Admin" />
        <div className="login-art-body">
          <span className="eyebrow eyebrow--light">Staff workspace</span>
          <h2>
            Run the hive, <em>from one place.</em>
          </h2>
          <ul className="login-features">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span>
                  <Icon size={17} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <small>
          © {new Date().getFullYear()} {SITE.parent} · {SITE.slogan}
        </small>
      </aside>

      <main className="login-form-wrap">
        <Link to="/" className="login-back">
          <ArrowLeft size={16} /> Back to shop
        </Link>
        <div className="login-card">
          <div className="login-mobile-logo">
            <Logo small="Admin" />
          </div>

          {step !== 'password' && step !== 'done' && (
            <ol className="login-steps" aria-label="Progress">
              {(step === 'code' ? ['Password', 'Code'] : ['Email', 'Code', 'New password']).map((label, i) => {
                const at = step === 'code' ? 1 : { forgotEmail: 0, forgotCode: 1, forgotNew: 2 }[step]
                return (
                  <li key={label} className={i < at ? 'is-done' : i === at ? 'is-on' : ''}>
                    <span>{i < at ? '✓' : i + 1}</span> {label}
                  </li>
                )
              })}
            </ol>
          )}

          <span className={`login-lock ${step === 'done' ? 'login-lock--ok' : ''}`}>
            <S.icon size={20} />
          </span>
          <h1>{S.title}</h1>
          <p className="muted login-lead">
            {S.text}
            {step === 'code' && <strong> {challenge?.email_hint}</strong>}
            {step === 'forgotCode' && <strong> {email.trim()}</strong>}
          </p>

          {error && (
            <div className="login-error" role="alert">
              <Notice variant="danger">{error}</Notice>
            </div>
          )}
          {info && !error && (
            <div style={{ marginBottom: 16 }}>
              <Notice variant="success">{info}</Notice>
            </div>
          )}

          {step === 'password' && (
            <form className="stack" style={{ gap: 16 }} onSubmit={submitPassword} noValidate>
              <div className="field">
                <label htmlFor="login-email">Email</label>
                <div className="input-icon">
                  <Mail size={18} />
                  <input id="login-email" className="input" type="email" inputMode="email" autoComplete="username" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
                </div>
              </div>
              <PasswordField id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Your password" />
              <div className="login-row">
                <span />
                <button type="button" className="link-btn" onClick={() => go('forgotEmail')}>
                  Forgot password?
                </button>
              </div>
              <button className="btn btn--primary btn--lg btn--block login-submit" disabled={busy}>
                {busy ? <Spinner /> : <LogIn size={18} />} {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {(step === 'code' || step === 'forgotCode') && (
            <form
              className="stack"
              style={{ gap: 18 }}
              onSubmit={(e) => {
                e.preventDefault()
                if (step === 'code') submitCode()
                else submitResetCode()
              }}
            >
              <OtpInput value={code} onChange={setCode} onComplete={step === 'code' ? submitCode : submitResetCode} disabled={busy} invalid={Boolean(error)} />
              <button className="btn btn--primary btn--lg btn--block login-submit" disabled={busy || code.length !== 6}>
                {busy ? <Spinner /> : <ShieldCheck size={18} />} {busy ? 'Checking…' : step === 'code' ? 'Verify and sign in' : 'Verify code'}
              </button>
              <div className="login-row">
                <button type="button" className="link-btn" onClick={() => go(step === 'code' ? 'password' : 'forgotEmail')}>
                  <ArrowLeft size={14} /> {step === 'code' ? 'Use another account' : 'Change email'}
                </button>
                <button type="button" className="link-btn" disabled={cooldown > 0 || busy} onClick={step === 'code' ? resendLogin : sendReset}>
                  <RefreshCw size={14} /> {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
              <p className="small muted mb-0">The code expires in 10 minutes. Check your spam folder if it does not arrive.</p>
            </form>
          )}

          {step === 'forgotEmail' && (
            <form className="stack" style={{ gap: 16 }} onSubmit={sendReset} noValidate>
              <div className="field">
                <label htmlFor="reset-email">Staff email</label>
                <div className="input-icon">
                  <Mail size={18} />
                  <input id="reset-email" className="input" type="email" inputMode="email" autoComplete="username" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
                </div>
              </div>
              <button className="btn btn--primary btn--lg btn--block login-submit" disabled={busy}>
                {busy ? <Spinner /> : <Mail size={18} />} {busy ? 'Sending…' : 'Send code'}
              </button>
              <button type="button" className="link-btn" onClick={() => go('password')}>
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </form>
          )}

          {step === 'forgotNew' && (
            <form className="stack" style={{ gap: 16 }} onSubmit={submitNewPassword} noValidate>
              <PasswordField id="new-password" label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" autoFocus placeholder="At least 8 characters" />
              <div className={`strength strength--${strength}`} aria-live="polite">
                <span />
                <span />
                <span />
                <span />
                <small>{newPassword ? ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][strength] : 'Password strength'}</small>
              </div>
              <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Type it again" />
              <button className="btn btn--primary btn--lg btn--block login-submit" disabled={busy}>
                {busy ? <Spinner /> : <KeyRound size={18} />} {busy ? 'Saving…' : 'Save new password'}
              </button>
            </form>
          )}

          {step === 'done' && (
            <button className="btn btn--primary btn--lg btn--block login-submit" onClick={() => go('password')}>
              <LogIn size={18} /> Back to sign in
            </button>
          )}

          <p className="login-note">
            <ShieldCheck size={16} /> Authorised staff only. Sign-ins use a password and a code sent to your email. We will
            never ask for your code by phone.
          </p>
        </div>
      </main>
    </div>
  )
}
