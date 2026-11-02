import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, Smartphone, XCircle } from 'lucide-react'
import { Field, Notice, Spinner } from './ui.jsx'
import { shopApi } from '../lib/api.js'
import { formatRWF, isValidPhone } from '../lib/format.js'
import { PAYMENT_SAFETY } from '../config/site.js'

const NETWORKS = [
  { value: 'mtn_momo', label: 'MTN MoMo', hint: '078 / 079' },
  { value: 'airtel', label: 'Airtel Money', hint: '072 / 073' },
]
const guessNetwork = (phone) => {
  const d = String(phone).replace(/\D/g, '').replace(/^250/, '0')
  if (/^07[89]/.test(d)) return 'mtn_momo'
  if (/^07[23]/.test(d)) return 'airtel'
  return null
}

/**
 * Pay from the phone: we ask MTN / Airtel to show a payment prompt on the customer's phone;
 * they approve it with their PIN there (we never see the PIN), and this panel waits for the result.
 */
export default function MobilePay({ order, sandbox, onPaid }) {
  const stored = sessionStorage.getItem(`ubh_phone_${order.order_number}`) || ''
  const preferred = ['mtn_momo', 'airtel'].includes(order.payment?.method) ? order.payment.method : guessNetwork(stored) || 'mtn_momo'
  const [network, setNetwork] = useState(preferred)
  const [payer, setPayer] = useState(stored)
  const [orderPhone, setOrderPhone] = useState(stored)
  const [stage, setStage] = useState('form') // form | waiting | paid | failed
  const [request, setRequest] = useState(null) // { payment_id, expires_at, payer_phone }
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(0)
  const timer = useRef(null)

  // Poll the backend (which asks the provider) every 4 s while waiting.
  useEffect(() => {
    if (stage !== 'waiting' || !request) return undefined
    let alive = true
    const tick = async () => {
      try {
        const res = await shopApi.payMobileStatus(order.order_number, request.payment_id, orderPhone.trim())
        if (!alive) return
        if (res.data.status === 'paid') {
          setStage('paid')
          onPaid?.()
          return
        }
        if (res.data.status === 'failed') {
          setReason(res.data.reason || 'The payment was not completed.')
          setStage('failed')
          return
        }
      } catch {
        /* network hiccup: keep waiting */
      }
      if (alive) timer.current = setTimeout(tick, 4000)
    }
    timer.current = setTimeout(tick, 3000)
    return () => {
      alive = false
      clearTimeout(timer.current)
    }
  }, [stage, request, order.order_number, orderPhone, onPaid])

  // Countdown until the request expires.
  useEffect(() => {
    if (stage !== 'waiting' || !request?.expires_at) return undefined
    const update = () => setLeft(Math.max(0, Math.round((new Date(request.expires_at).getTime() - Date.now()) / 1000)))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [stage, request])

  const send = async (e) => {
    e.preventDefault()
    setError('')
    if (!isValidPhone(payer)) return setError('Enter the mobile money number that will pay, e.g. 0788 123 456')
    if (!isValidPhone(orderPhone)) return setError('Enter the phone number you used when ordering')
    const g = guessNetwork(payer)
    if (g && g !== network) return setError(`This looks like an ${g === 'mtn_momo' ? 'MTN' : 'Airtel'} number. Choose the matching network.`)
    setBusy(true)
    try {
      const res = await shopApi.payMobile(order.order_number, { network, payer_phone: payer.trim(), phone: orderPhone.trim() })
      sessionStorage.setItem(`ubh_phone_${order.order_number}`, orderPhone.trim())
      setRequest(res.data)
      setStage('waiting')
    } catch (err) {
      setError(err.errors?.[0]?.message || err.message)
    } finally {
      setBusy(false)
    }
  }

  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`

  if (stage === 'waiting') {
    return (
      <div className="mp-wait" role="status" aria-live="polite">
        <div className={`mp-phone mp-phone--${network}`} aria-hidden="true">
          <span className="mp-phone-notch" />
          <span className="mp-phone-screen">
            <b>{network === 'mtn_momo' ? 'MTN MoMo' : 'Airtel Money'}</b>
            <small>Pay {formatRWF(order.total_rwf)} to Ubw’iwacu Honey?</small>
            <span className="mp-phone-pin">• • • •</span>
          </span>
        </div>
        <div className="mp-wait-text">
          <h3>Check your phone</h3>
          <p>
            We sent a payment request to <strong>{request.payer_phone}</strong>. Approve <strong>{formatRWF(order.total_rwf)}</strong> by entering
            your PIN <em>on your phone</em>.
          </p>
          <p className="mp-status">
            <Loader2 size={16} className="spin" /> Waiting for your approval… {left > 0 && <span>({mmss} left)</span>}
          </p>
          {sandbox && <Notice>Test mode: no real prompt is sent. The payment is approved automatically in about 12 seconds.</Notice>}
          <p className="small muted">No prompt? Make sure your phone is on and has network. If nothing arrives, wait for the timer to end and try again.</p>
        </div>
      </div>
    )
  }

  if (stage === 'paid') {
    return (
      <div className="mp-result mp-result--ok">
        <CheckCircle2 size={34} />
        <div>
          <h3>Payment received</h3>
          <p>Thank you! Your payment was confirmed by {network === 'mtn_momo' ? 'MTN' : 'Airtel'}. Your receipt is ready below.</p>
        </div>
      </div>
    )
  }

  return (
    <form className="mp-form" onSubmit={send} noValidate>
      {stage === 'failed' && (
        <div className="mp-result mp-result--bad">
          <XCircle size={28} />
          <div>
            <h3>Payment not completed</h3>
            <p>{reason}</p>
          </div>
        </div>
      )}
      <div className="mp-networks" role="radiogroup" aria-label="Mobile money network">
        {NETWORKS.map((n) => (
          <label key={n.value} className={`mp-net mp-net--${n.value} ${network === n.value ? 'is-on' : ''}`}>
            <input type="radio" name="mp-network" value={n.value} checked={network === n.value} onChange={() => setNetwork(n.value)} />
            <span className="mp-net-icon">
              <Smartphone size={18} />
            </span>
            <span>
              <strong>{n.label}</strong>
              <small>{n.hint}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="form-grid">
        <Field label="Mobile money number that will pay" required>
          {(p) => (
            <input
              {...p}
              className="input"
              type="tel"
              inputMode="tel"
              placeholder="07XX XXX XXX"
              value={payer}
              onChange={(e) => {
                setPayer(e.target.value)
                const g = guessNetwork(e.target.value)
                if (g) setNetwork(g)
              }}
            />
          )}
        </Field>
        <Field label="Phone used for this order" required hint="To confirm it is your order.">
          {(p) => <input {...p} className="input" type="tel" inputMode="tel" value={orderPhone} onChange={(e) => setOrderPhone(e.target.value)} />}
        </Field>
      </div>
      {error && (
        <div style={{ marginTop: 12 }}>
          <Notice variant="danger">{error}</Notice>
        </div>
      )}
      <button className="btn btn--primary btn--lg btn--block" style={{ marginTop: 16 }} disabled={busy}>
        {busy ? <Spinner /> : stage === 'failed' ? <RefreshCw size={18} /> : <Smartphone size={18} />}{' '}
        {stage === 'failed' ? 'Try again' : `Send payment request · ${formatRWF(order.total_rwf)}`}
      </button>
      <p className="mp-safe">
        <ShieldCheck size={16} /> You approve the payment on your own phone. {PAYMENT_SAFETY}
      </p>
    </form>
  )
}
