import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Hourglass,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Store,
  Truck,
  X,
} from 'lucide-react'
import { WhatsAppIcon } from '../components/Brand.jsx'
import MobilePay from '../components/MobilePay.jsx'
import { ErrorState, Field, FulfilmentBadge, Loading, Notice, PaymentBadge, Spinner } from '../components/ui.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { shopApi } from '../lib/api.js'
import { useAsync, usePageMeta } from '../lib/useAsync.js'
import { formatDateTime, formatRWF, isValidPhone, waLink } from '../lib/format.js'
import { PAYMENT_METHODS, PAYMENT_SAFETY, SITE } from '../config/site.js'
import NotFound from './NotFound.jsx'

function PaymentReferenceForm({ order, onSubmitted }) {
  const toast = useToast()
  const stored = sessionStorage.getItem(`ubh_phone_${order.order_number}`) || ''
  const defaultMethod = ['mtn_momo', 'airtel', 'bank'].includes(order.payment?.method) ? order.payment.method : 'mtn_momo'
  const [form, setForm] = useState({ method: defaultMethod, transaction_ref: '', phone: stored })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (form.transaction_ref.trim().length < 4) errs.transaction_ref = 'Enter the transaction reference from your payment message'
    if (!isValidPhone(form.phone)) errs.phone = 'Enter the phone number you used when ordering'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const res = await shopApi.submitReference(order.order_number, {
        method: form.method,
        transaction_ref: form.transaction_ref.trim(),
        phone: form.phone.trim(),
      })
      sessionStorage.setItem(`ubh_phone_${order.order_number}`, form.phone.trim())
      toast.success('Reference received. We will verify your payment shortly.')
      onSubmitted(res.data)
    } catch (err) {
      setErrors({ ...err.fieldErrors, form: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: 14 }}>
      {errors.form && (
        <Notice variant="danger" icon={AlertTriangle}>
          {errors.form}
        </Notice>
      )}
      <Field label="How did you pay?" required>
        {(p) => (
          <select {...p} className="select" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Transaction reference" required error={errors.transaction_ref} hint="The ID in your MoMo / Airtel / bank confirmation message.">
        {(p) => (
          <input
            {...p}
            className="input"
            autoComplete="off"
            value={form.transaction_ref}
            onChange={(e) => setForm({ ...form, transaction_ref: e.target.value })}
            placeholder="e.g. 1234567890"
          />
        )}
      </Field>
      <Field label="Phone number used for this order" required error={errors.phone}>
        {(p) => <input {...p} className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
      </Field>
      <Notice variant="forest" icon={ShieldCheck}>
        {PAYMENT_SAFETY}
      </Notice>
      <button className="btn btn--primary btn--lg" disabled={busy}>
        {busy ? <Spinner /> : <Check size={18} />} Submit payment reference
      </button>
    </form>
  )
}

function ReceiptDownload({ order }) {
  const [phone, setPhone] = useState(sessionStorage.getItem(`ubh_phone_${order.order_number}`) || '')
  const valid = isValidPhone(phone)
  return (
    <div className="stack" style={{ gap: 12 }}>
      <Notice variant="success" icon={CheckCircle2} title="Payment confirmed.">
        Your payment has been verified{order.receipt_number ? ` and receipt ${order.receipt_number} has been issued` : ''}.
      </Notice>
      <Field label="Phone number used for this order" hint="Needed to download your receipt.">
        {(p) => <input {...p} className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
      </Field>
      <a
        className="btn btn--dark"
        aria-disabled={!valid}
        href={valid ? shopApi.receiptUrl(order.order_number, phone.trim()) : undefined}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => !valid && e.preventDefault()}
      >
        <Download size={18} /> Download payment receipt (PDF)
      </a>
    </div>
  )
}

export default function OrderStatus() {
  const { orderNumber } = useParams()
  const location = useLocation()
  const toast = useToast()
  const justPlaced = location.state?.justPlaced
  const initial = location.state?.order
  const { data, error, loading, reload, setData } = useAsync(
    () => (initial && initial.order_number === orderNumber.toUpperCase() ? Promise.resolve({ data: initial }) : shopApi.track(orderNumber)),
    [orderNumber],
  )
  usePageMeta(`Order ${orderNumber.toUpperCase()}`)
  const momo = useAsync(() => shopApi.mobileConfig(), [])
  const [payTab, setPayTab] = useState('phone')

  useEffect(() => {
    if (justPlaced) window.history.replaceState({}, '')
  }, [justPlaced])

  if (loading && !data) return <Loading label="Loading your order…" />
  if (error?.status === 404) return <NotFound title="Order not found" message="Check the order number and try again." />
  if (error && !data) return <ErrorState error={error} onRetry={reload} />

  const order = data
  const isDelivery = order.fulfilment_type === 'delivery'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.order_number)
      toast.success('Order number copied.')
    } catch {
      /* ignore */
    }
  }
  const refresh = async () => {
    try {
      const res = await shopApi.track(order.order_number)
      setData(res.data)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const stage = order.payment_status === 'paid' ? 2 : order.payment_status === 'verification' ? 1 : 0
  const PAY_STEPS = ['Pay the total', 'Payment checked', 'Confirmed & receipt']
  const phonePay = Boolean(momo.data?.enabled)
  const tab = phonePay ? payTab : 'reference'
  const area = order.delivery
    ? [order.delivery.village, order.delivery.cell, order.delivery.sector, order.delivery.district, order.delivery.province].filter(Boolean).join(', ')
    : ''

  return (
    <div className="os-page">
      <section className={`os-hero ${justPlaced ? 'os-hero--new' : ''}`}>
        <div className="container os-hero-inner">
          {justPlaced ? (
            <>
              <span className="os-check" aria-hidden="true">
                <CheckCircle2 size={34} />
              </span>
              <span className="eyebrow eyebrow--light">Order received</span>
              <h1>Thank you, {order.customer.name}!</h1>
              <p>
                Your order is <strong>waiting for payment</strong>. Keep your order number: you need it to send your
                payment reference and to track your order.
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow eyebrow--light">Order tracking</span>
              <h1>Your order</h1>
              <p>Placed {formatDateTime(order.created_at)}</p>
            </>
          )}
          <div className="os-ref">
            <span className="os-ref-label">Order number</span>
            <strong>{order.order_number}</strong>
            <button onClick={copy} aria-label="Copy order number">
              <Copy size={16} /> Copy
            </button>
          </div>
          <Link to={'/order/' + order.order_number + '/invoice'} className="os-invoice-link">
            <FileText size={15} /> View / print invoice
          </Link>
          <div className="os-badges">
            <PaymentBadge status={order.payment_status} />
            <FulfilmentBadge status={order.fulfilment_status} />
          </div>
        </div>
      </section>

      <div className="container os-track-wrap">
        <ol className="os-track" aria-label="Order progress">
          {order.timeline.map((s) => {
            const stop = s.key === 'cancelled' || s.key === 'refunded'
            return (
              <li key={s.key} className={`${s.done ? 'is-done' : ''} ${s.current ? 'is-current' : ''} ${stop ? 'is-stop' : ''}`}>
                <span className="os-track-dot">{stop ? <X size={14} /> : s.done ? <Check size={14} /> : null}</span>
                <span className="os-track-label">{s.label}</span>
                {s.at && <span className="os-track-at">{formatDateTime(s.at)}</span>}
              </li>
            )
          })}
        </ol>
      </div>

      <div className="container os-grid">
        <div className="stack" style={{ gap: 20 }}>
          <div className="os-card os-card--main">
            <div className="os-card-head">
              <h2>{order.payment_status === 'paid' ? 'Payment confirmed' : 'What to do next'}</h2>
              <button className="btn btn--ghost btn--sm" onClick={refresh}>
                <RefreshCw size={15} /> Refresh
              </button>
            </div>

            {['pending', 'rejected', 'verification', 'paid'].includes(order.payment_status) && (
              <ol className="os-paysteps">
                {PAY_STEPS.map((label, i) => (
                  <li key={label} className={i < stage ? 'is-done' : i === stage ? 'is-on' : ''}>
                    <span>{i < stage ? <Check size={14} /> : i + 1}</span>
                    {label}
                  </li>
                ))}
              </ol>
            )}

            {order.payment_status === 'paid' ? (
              <ReceiptDownload order={order} />
            ) : order.payment_status === 'verification' ? (
              <Notice variant="info" icon={Hourglass} title="We are verifying your payment.">
                Thank you for sending your transaction reference. Our team checks it against the money received. Your
                order is confirmed and your receipt issued once verification is complete.
              </Notice>
            ) : order.payment_status === 'refunded' ? (
              <Notice icon={AlertTriangle}>This order has been refunded. Contact us if you have any questions.</Notice>
            ) : order.can_submit_payment_reference ? (
              <div className="stack" style={{ gap: 22 }}>
                {order.payment_status === 'rejected' && (
                  <Notice variant="danger" icon={AlertTriangle} title="We could not confirm your last payment reference.">
                    {order.payment?.rejection_reason || 'Please check the reference and submit it again, or contact us.'}
                  </Notice>
                )}
                {phonePay && (
                  <div className="pay-switch" role="tablist" aria-label="How do you want to pay?">
                    <button role="tab" aria-selected={tab === 'phone'} onClick={() => setPayTab('phone')}>
                      <Smartphone size={18} />
                      <span>
                        <strong>Pay from my phone</strong>
                        <small>Fastest · approve with your PIN</small>
                      </span>
                    </button>
                    <button role="tab" aria-selected={tab === 'reference'} onClick={() => setPayTab('reference')}>
                      <ClipboardCheck size={18} />
                      <span>
                        <strong>I already paid</strong>
                        <small>Send your transaction reference</small>
                      </span>
                    </button>
                  </div>
                )}
                {tab === 'phone' ? (
                  <MobilePay order={order} sandbox={momo.data?.sandbox} onPaid={refresh} />
                ) : (
                <>
                <div className="os-step">
                  <h3>
                    <span>1</span> Pay {formatRWF(order.total_rwf)}
                    {order.payment?.method_label ? ` with ${order.payment.method_label}` : ''}
                  </h3>
                  {order.payment_instructions ? (
                    <div className="os-instructions">{order.payment_instructions}</div>
                  ) : (
                    <>
                      <p className="muted" style={{ margin: '0 0 12px' }}>
                        Our team will send you the official payment details. You can ask for them now on WhatsApp or by
                        calling <a href={`tel:${SITE.phone}`}>{SITE.phoneDisplay}</a>.
                      </p>
                      <a
                        className="btn btn--whatsapp btn--sm"
                        href={waLink(`Hello Ubw'iwacu Honey. Please send me payment instructions for order ${order.order_number} (${formatRWF(order.total_rwf)}).`)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <WhatsAppIcon size={16} /> Ask for payment instructions
                      </a>
                    </>
                  )}
                </div>
                <div className="os-step">
                  <h3>
                    <span>2</span> Send us your transaction reference
                  </h3>
                  <PaymentReferenceForm order={order} onSubmitted={setData} />
                </div>
                </>
                )}
              </div>
            ) : (
              <Notice icon={AlertTriangle}>This order is {order.fulfilment_status}. Contact us if you have questions.</Notice>
            )}
          </div>

          <div className="os-card">
            <div className="os-card-head">
              <h2>Items</h2>
              <span className="small muted">
                {order.items.reduce((n, i) => n + i.quantity, 0)} item(s)
              </span>
            </div>
            <ul className="os-items">
              {order.items.map((i) => (
                <li key={`${i.product_name}-${i.package_size}`}>
                  <span className="os-item-hex">{i.package_size}</span>
                  <span className="os-item-text">
                    <strong>{i.product_name}</strong>
                    <small>
                      {i.quantity} × {formatRWF(i.unit_price_rwf)}
                    </small>
                  </span>
                  <strong>{formatRWF(i.line_total_rwf)}</strong>
                </li>
              ))}
            </ul>
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatRWF(order.subtotal_rwf)}</span>
            </div>
            {order.discount_rwf > 0 && (
              <div className="summary-row">
                <span>Discount</span>
                <span>−{formatRWF(order.discount_rwf)}</span>
              </div>
            )}
            <div className="summary-row">
              <span>Delivery</span>
              <span className="muted">Paid to your rider</span>
            </div>
            <div className="summary-row total">
              <span>Total</span>
              <span>{formatRWF(order.total_rwf)}</span>
            </div>
            {order.amount_paid_rwf > 0 && (
              <div className="summary-row">
                <span>Amount paid</span>
                <span>{formatRWF(order.amount_paid_rwf)}</span>
              </div>
            )}
          </div>
        </div>

        <aside className="stack" style={{ gap: 20 }}>
          <div className="os-card">
            <div className="os-card-head">
              <h2 className="row" style={{ gap: 8 }}>
                {isDelivery ? <Truck size={19} /> : <Store size={19} />} {isDelivery ? 'Delivery' : 'Collection'}
              </h2>
            </div>
            {isDelivery && order.delivery ? (
              <div className="os-place">
                <span className="os-pin">
                  <MapPin size={18} />
                </span>
                <div>
                  <strong>{order.delivery.recipient_name}</strong>
                  <p>{area}</p>
                  {order.delivery.address && <p>{order.delivery.address}</p>}
                  {order.delivery.landmark && <p className="muted">Landmark: {order.delivery.landmark}</p>}
                  {order.delivery.preferred_time && <p className="muted">Preferred time: {order.delivery.preferred_time}</p>}
                </div>
              </div>
            ) : (
              <p className="muted mb-0">{order.fulfilment_notice}</p>
            )}
            <p className="os-note">{order.delivery_notice}</p>
          </div>

          <div className="os-card os-help">
            <h2>Need help?</h2>
            <p className="small muted">Quote your order number {order.order_number}.</p>
            <div className="stack" style={{ gap: 8 }}>
              <a className="btn btn--whatsapp btn--block" href={waLink(`Hello Ubw'iwacu Honey. I have a question about order ${order.order_number}.`)} target="_blank" rel="noreferrer">
                <WhatsAppIcon size={18} /> WhatsApp us
              </a>
              <div className="row" style={{ gap: 8 }}>
                <a className="btn btn--outline" style={{ flex: 1 }} href={`tel:${SITE.phone}`}>
                  <Phone size={16} /> Call
                </a>
                <a className="btn btn--outline" style={{ flex: 1 }} href={`mailto:${SITE.email}?subject=Order ${order.order_number}`}>
                  <Mail size={16} /> Email
                </a>
              </div>
            </div>
          </div>
          <Link to="/shop" className="btn btn--dark btn--block">
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  )
}
