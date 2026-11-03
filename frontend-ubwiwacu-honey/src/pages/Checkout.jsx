import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building,
  CheckCircle2,
  ClipboardCheck,
  Home as HomeIcon,
  Lock,
  MapPin,
  Pencil,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
  User,
} from 'lucide-react'
import { ProductMedia } from '../components/ProductCard.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import { EmptyState, Field, Notice, Spinner } from '../components/ui.jsx'
import { useCart } from '../context/CartContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { shopApi } from '../lib/api.js'
import { usePageMeta } from '../lib/useAsync.js'
import { formatRWF, isValidEmail, isValidPhone, uuid } from '../lib/format.js'
import { DELIVERY_NOTICE, PAYMENT_SAFETY } from '../config/site.js'
import { areaStore } from '../config/rwanda.js'

const IDEM_KEY = 'ubh_checkout_idem'

const METHODS = [
  { value: 'mtn_momo', label: 'MTN MoMo', desc: 'Pay with Mobile Money, then send us the reference', icon: Smartphone, tone: 'mtn' },
  { value: 'airtel', label: 'Airtel Money', desc: 'Pay with Airtel Money, then send the reference', icon: Smartphone, tone: 'airtel' },
  { value: 'bank', label: 'Bank transfer', desc: 'Transfer, then send the transaction reference', icon: Building, tone: 'bank' },
  { value: 'cash', label: 'Cash', desc: 'Pay in cash when you collect', icon: Banknote, tone: 'cash', collectionOnly: true },
]

const EMPTY = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  fulfilment_type: 'delivery',
  delivery_recipient_name: '',
  delivery_phone: '',
  delivery_email: '',
  delivery_address: '',
  delivery_landmark: '',
  delivery_preferred_time: '',
  payment_method: 'mtn_momo',
  notes: '',
}
const EMPTY_MANUAL = { province: '', district: '', sector: '', cell: '', village: '' }

function validate(f, place, manual, acknowledged) {
  const e = {}
  if (!f.customer_name.trim()) e.customer_name = 'Please enter your name'
  if (!isValidPhone(f.customer_phone)) e.customer_phone = 'Enter a valid phone number, e.g. 0788 123 456'
  if (f.customer_email && !isValidEmail(f.customer_email)) e.customer_email = 'This email address looks incorrect'
  if (f.fulfilment_type === 'delivery') {
    if (!f.delivery_recipient_name.trim()) e.delivery_recipient_name = 'Who will receive the order?'
    if (!isValidPhone(f.delivery_phone)) e.delivery_phone = 'Enter the recipient’s phone number'
    if (f.delivery_email && !isValidEmail(f.delivery_email)) e.delivery_email = 'This email address looks incorrect'
    if (!place && !(manual.district && manual.sector.trim() && manual.cell.trim() && manual.village.trim())) {
      e.location = 'Choose where we should deliver (down to the village)'
    }
    if (!f.delivery_landmark.trim()) e.delivery_landmark = 'A landmark helps the rider find you'
  }
  if (f.payment_method === 'cash' && f.fulfilment_type !== 'collection') e.payment_method = 'Cash is only available when you collect'
  if (!acknowledged) e.acknowledged = 'Please confirm you have read the delivery notice'
  return e
}

// Which checkout step each error belongs to (0 details, 1 delivery, 2 payment, 3 review).
const STEP_OF = (key) =>
  key.startsWith('customer_') ? 0 : key.startsWith('delivery_') || key === 'location' ? 1 : key === 'payment_method' ? 2 : 3

/**
 * One step of the checkout. Open = editable; done = folded into a one-line summary with "Edit";
 * upcoming steps show only their title.
 */
function Section({ index, step, icon: Icon, title, text, summary, onEdit, onNext, nextLabel = 'Continue', children }) {
  const open = step === index
  const done = step > index
  return (
    <fieldset className={`co-section ${open ? 'is-open' : done ? 'is-done' : 'is-next'}`} aria-current={open ? 'step' : undefined}>
      <legend className="co-legend">
        <span className="co-num">{done ? <CheckCircle2 size={16} /> : index + 1}</span>
        <span className="co-legend-text">
          <strong>
            <Icon size={17} /> {title}
          </strong>
          {open && text && <small>{text}</small>}
          {done && summary && <small className="co-summary-line">{summary}</small>}
        </span>
        {done && (
          <button type="button" className="link-btn co-edit" onClick={onEdit}>
            <Pencil size={13} /> Edit
          </button>
        )}
      </legend>
      {open && (
        <div className="co-body">
          {children}
          {onNext && (
            <div className="co-next">
              <button type="button" className="btn btn--dark btn--lg" onClick={onNext}>
                {nextLabel} <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}
    </fieldset>
  )
}

export default function Checkout() {
  usePageMeta('Checkout')
  const { lines, subtotal, clear } = useCart()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  // A village chosen in the header's "Deliver to" carries straight into checkout.
  const [area] = useState(() => areaStore.get())
  const [place, setPlace] = useState(() => (area?.level === 'village' ? area : null))
  const [manual, setManual] = useState(EMPTY_MANUAL)
  const [errors, setErrors] = useState({})
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [step, setStep] = useState(0)
  const formRef = useRef(null)

  // One idempotency key per checkout attempt; survives a refresh so a double submit never creates two orders.
  const idemKey = useMemo(() => {
    let k = sessionStorage.getItem(IDEM_KEY)
    if (!k) {
      k = uuid()
      sessionStorage.setItem(IDEM_KEY, k)
    }
    return k
  }, [])

  const clearError = (key) => errors[key] && setErrors((er) => ({ ...er, [key]: undefined }))

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'fulfilment_type' && value === 'delivery' && f.payment_method === 'cash') next.payment_method = 'mtn_momo'
      return next
    })
    clearError(key)
  }

  const choosePlace = (p) => {
    setPlace(p)
    clearError('location')
    if (p) areaStore.set(p)
  }

  const copyCustomerToRecipient = () =>
    setForm((f) => ({
      ...f,
      delivery_recipient_name: f.customer_name,
      delivery_phone: f.customer_phone,
      delivery_email: f.customer_email,
    }))

  if (lines.length === 0) {
    return (
      <section className="section">
        <div className="container">
          <EmptyState icon={ShoppingBag} title="Your cart is empty" action={<Link to="/shop" className="btn btn--primary">Shop honey</Link>}>
            Add some honey to your cart before checking out.
          </EmptyState>
        </div>
      </section>
    )
  }

  const isDelivery = form.fulfilment_type === 'delivery'
  const count = lines.reduce((n, l) => n + l.quantity, 0)

  const focusFirstError = () =>
    requestAnimationFrame(() => {
      const first = formRef.current?.querySelector('[aria-invalid="true"], [data-error="true"]')
      first?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      first?.focus?.({ preventScroll: true })
    })

  const scrollToStep = (i) =>
    requestAnimationFrame(() => formRef.current?.querySelectorAll('.co-section')[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  /** Check one step; move to the next when it is complete. */
  const goNext = (i) => {
    const all = validate(form, place, manual, true)
    const mine = Object.fromEntries(Object.entries(all).filter(([k]) => STEP_OF(k) === i))
    setErrors(mine)
    if (Object.keys(mine).length) return focusFirstError()
    setStep(i + 1)
    scrollToStep(i + 1)
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setServerError(null)
    const errs = validate(form, place, manual, acknowledged)
    setErrors(errs)
    if (Object.keys(errs).length) {
      // Re-open the earliest step that needs attention.
      const firstStep = Math.min(...Object.keys(errs).map(STEP_OF))
      if (firstStep < 3) setStep(firstStep)
      focusFirstError()
      return
    }

    const body = {
      items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      customer_email: form.customer_email.trim() || undefined,
      fulfilment_type: form.fulfilment_type,
      payment_method: form.payment_method,
      notes: form.notes.trim() || undefined,
      idempotencyKey: idemKey,
    }
    if (isDelivery) {
      for (const k of Object.keys(EMPTY)) {
        if (k.startsWith('delivery_') && form[k].trim()) body[k] = form[k].trim()
      }
      const loc = place || manual
      Object.assign(body, {
        delivery_province: loc.province || undefined,
        delivery_district: loc.district,
        delivery_sector: loc.sector.trim(),
        delivery_cell: loc.cell.trim(),
        delivery_village: loc.village.trim(),
        delivery_location_code: place?.code,
      })
    }

    setSubmitting(true)
    try {
      const res = await shopApi.createOrder(body)
      const order = res.data
      sessionStorage.removeItem(IDEM_KEY)
      sessionStorage.setItem(`ubh_phone_${order.order_number}`, form.customer_phone.trim())
      clear()
      navigate(`/order/${order.order_number}`, { replace: true, state: { order, justPlaced: true } })
    } catch (err) {
      const fe = err.fieldErrors || {}
      if (fe.delivery_location_code) fe.location = fe.delivery_location_code
      setErrors(fe)
      const keys = Object.keys(fe)
      if (keys.length) setStep(Math.min(...keys.map(STEP_OF), 3))
      const detail = err.errors?.filter((x) => x.field === 'items').map((x) => x.message)
      setServerError(detail?.length ? `${err.message}: ${detail.join('; ')}` : err.message)
      toast.error(err.message)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="co-page">
      <div className="container">
        <div className="co-top">
          <Link to="/cart" className="link-arrow">
            <ArrowLeft size={18} /> Back to cart
          </Link>
          <ol className="checkout-steps">
            <li className="done">
              <span className="dot">
                <CheckCircle2 size={14} />
              </span>
              Cart
            </li>
            <li className="sep" aria-hidden="true" />
            <li className="current">
              <span className="dot">2</span>Details
            </li>
            <li className="sep" aria-hidden="true" />
            <li>
              <span className="dot">3</span>Pay &amp; confirm
            </li>
          </ol>
        </div>
        <h1 className="page-title">Checkout</h1>
        <p className="muted co-intro">No account needed. It takes about a minute.</p>

        {serverError && (
          <div style={{ marginBottom: 20 }}>
            <Notice variant="danger" title="We couldn’t place your order.">
              {serverError}
            </Notice>
          </div>
        )}

        <form ref={formRef} className="cart-layout" onSubmit={onSubmit} noValidate>
          <div className="co-main">
            <Section
              index={0}
              step={step}
              icon={User}
              title="Your details"
              text="No account needed. We only ask for what we need to process your order."
              summary={[form.customer_name, form.customer_phone, form.customer_email].filter(Boolean).join(' · ')}
              onEdit={() => setStep(0)}
              onNext={() => goNext(0)}
              nextLabel="Continue to delivery"
            >
              <div className="form-grid">
                <Field label="Full name" required error={errors.customer_name}>
                  {(p) => <input {...p} className="input" autoComplete="name" value={form.customer_name} onChange={set('customer_name')} />}
                </Field>
                <Field label="Phone number" required error={errors.customer_phone} hint="We’ll call or WhatsApp this number to confirm.">
                  {(p) => <input {...p} className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={form.customer_phone} onChange={set('customer_phone')} />}
                </Field>
                <Field className="full" label="Email (optional)" error={errors.customer_email} hint="Add an email to receive your payment receipt.">
                  {(p) => <input {...p} className="input" type="email" autoComplete="email" value={form.customer_email} onChange={set('customer_email')} />}
                </Field>
              </div>
            </Section>

            <Section
              index={1}
              step={step}
              icon={Truck}
              title="Delivery or collection"
              text="Choose where your honey should go. Delivery is arranged and paid by you."
              summary={
                isDelivery
                  ? `Deliver to ${[(place || manual).village, (place || manual).sector, (place || manual).district].filter(Boolean).join(', ')} · ${form.delivery_recipient_name}`
                  : 'I’ll collect'
              }
              onEdit={() => setStep(1)}
              onNext={() => goNext(1)}
              nextLabel="Continue to payment"
            >
              <div className="co-toggle" role="radiogroup" aria-label="Delivery or collection">
                <label className={`co-toggle-opt ${isDelivery ? 'is-on' : ''}`}>
                  <input type="radio" name="fulfilment_type" value="delivery" checked={isDelivery} onChange={set('fulfilment_type')} />
                  <Truck size={22} />
                  <span>
                    <strong>Deliver to me</strong>
                    <small>You arrange and pay the rider</small>
                  </span>
                </label>
                <label className={`co-toggle-opt ${!isDelivery ? 'is-on' : ''}`}>
                  <input type="radio" name="fulfilment_type" value="collection" checked={!isDelivery} onChange={set('fulfilment_type')} />
                  <Store size={22} />
                  <span>
                    <strong>I’ll collect</strong>
                    <small>We confirm when and where</small>
                  </span>
                </label>
              </div>

              {isDelivery ? (
                <div className="co-delivery">
                  <div className="co-sub">
                    <span>
                      <MapPin size={16} /> Where should we deliver?
                    </span>
                  </div>
                  <LocationPicker
                    value={place}
                    onChange={choosePlace}
                    manual={manual}
                    onManualChange={(patch) => {
                      setManual((m) => ({ ...m, ...patch }))
                      clearError('location')
                    }}
                    error={errors.location}
                    initialQuery={area && area.level !== 'village' && area.level !== 'province' ? area.name : ''}
                  />
                  {errors.location && (
                    <p className="field-error-text" role="alert">
                      {errors.location}
                    </p>
                  )}

                  <div className="form-grid" style={{ marginTop: 16 }}>
                    <Field label="Street address or house code (optional)" className="full" error={errors.delivery_address} hint="Rwanda street codes look like KG 7 Ave or KN 3 Rd. Add a house number if you have one.">
                      {(p) => <input {...p} className="input" autoComplete="street-address" placeholder="e.g. KG 7 Ave, house 24" value={form.delivery_address} onChange={set('delivery_address')} />}
                    </Field>
                    <Field label="Landmark" required error={errors.delivery_landmark} className="full" hint="A nearby place the rider can ask for.">
                      {(p) => <input {...p} className="input" placeholder="e.g. Opposite Kimihurura market, blue gate" value={form.delivery_landmark} onChange={set('delivery_landmark')} />}
                    </Field>
                  </div>

                  <div className="co-sub">
                    <span>
                      <HomeIcon size={16} /> Who receives it?
                    </span>
                    <button type="button" className="link-btn" onClick={copyCustomerToRecipient}>
                      Same as my details
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field label="Recipient name" required error={errors.delivery_recipient_name}>
                      {(p) => <input {...p} className="input" value={form.delivery_recipient_name} onChange={set('delivery_recipient_name')} />}
                    </Field>
                    <Field label="Recipient phone" required error={errors.delivery_phone}>
                      {(p) => <input {...p} className="input" type="tel" inputMode="tel" value={form.delivery_phone} onChange={set('delivery_phone')} />}
                    </Field>
                    <Field label="Recipient email (optional)" error={errors.delivery_email}>
                      {(p) => <input {...p} className="input" type="email" value={form.delivery_email} onChange={set('delivery_email')} />}
                    </Field>
                    <Field label="Preferred time (optional)">
                      {(p) => <input {...p} className="input" placeholder="e.g. Weekdays after 5 PM" value={form.delivery_preferred_time} onChange={set('delivery_preferred_time')} />}
                    </Field>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <Notice variant="forest" icon={Store}>
                    You chose to collect your order. Ubw’iwacu Honey will contact you to confirm when and where your order is ready.
                  </Notice>
                </div>
              )}
            </Section>

            <Section
              index={2}
              step={step}
              icon={Smartphone}
              title="How will you pay?"
              text="You pay after placing the order. Instructions appear on the next screen."
              summary={METHODS.find((m) => m.value === form.payment_method)?.label}
              onEdit={() => setStep(2)}
              onNext={() => goNext(2)}
              nextLabel="Review order"
            >
              <div className="pay-grid" role="radiogroup" aria-label="Payment method" data-error={errors.payment_method ? 'true' : undefined}>
                {METHODS.filter((m) => !m.collectionOnly || !isDelivery).map(({ value, label, desc, icon: Icon, tone }) => (
                  <label className={`pay-opt pay-opt--${tone} ${form.payment_method === value ? 'is-on' : ''}`} key={value}>
                    <input type="radio" name="payment_method" value={value} checked={form.payment_method === value} onChange={set('payment_method')} />
                    <span className="pay-icon">
                      <Icon size={20} />
                    </span>
                    <strong>{label}</strong>
                    <small>{desc}</small>
                    <span className="pay-check" aria-hidden="true">
                      <CheckCircle2 size={18} />
                    </span>
                  </label>
                ))}
              </div>
              {errors.payment_method && <p className="field-error-text">{errors.payment_method}</p>}
              <ol className="pay-steps">
                <li>
                  <span>1</span> Place your order
                </li>
                <li>
                  <span>2</span> Pay using the instructions shown
                </li>
                <li>
                  <span>3</span> Send the transaction reference
                </li>
                <li>
                  <span>4</span> We verify and confirm
                </li>
              </ol>
              <p className="pay-safety">
                <ShieldCheck size={17} /> {PAYMENT_SAFETY}
              </p>
            </Section>

            <Section index={3} step={step} icon={ClipboardCheck} title="Review & place order" text="Check everything, then place your order from the summary.">
              <dl className="co-review">
                <div>
                  <dt>
                    <User size={15} /> You
                  </dt>
                  <dd>{[form.customer_name, form.customer_phone, form.customer_email].filter(Boolean).join(' · ')}</dd>
                  <button type="button" className="link-btn" onClick={() => setStep(0)}>
                    Edit
                  </button>
                </div>
                <div>
                  <dt>{isDelivery ? <Truck size={15} /> : <Store size={15} />} {isDelivery ? 'Delivery' : 'Collection'}</dt>
                  <dd>
                    {isDelivery ? (
                      <>
                        {[(place || manual).village, (place || manual).cell, (place || manual).sector, (place || manual).district].filter(Boolean).join(', ')}
                        {form.delivery_address && <> · {form.delivery_address}</>}
                        <br />
                        <span className="muted">
                          {form.delivery_landmark} · to {form.delivery_recipient_name} ({form.delivery_phone})
                        </span>
                      </>
                    ) : (
                      'We will contact you with the collection time and place.'
                    )}
                  </dd>
                  <button type="button" className="link-btn" onClick={() => setStep(1)}>
                    Edit
                  </button>
                </div>
                <div>
                  <dt>
                    <Smartphone size={15} /> Payment
                  </dt>
                  <dd>{METHODS.find((m) => m.value === form.payment_method)?.label} · pay after placing the order</dd>
                  <button type="button" className="link-btn" onClick={() => setStep(2)}>
                    Edit
                  </button>
                </div>
              </dl>
              <Field label="Order notes (optional)">
                {(p) => <textarea {...p} className="textarea" maxLength={1000} placeholder="Gift message, special requests…" value={form.notes} onChange={set('notes')} />}
              </Field>
            </Section>
          </div>

          <aside className="summary">
            <div className="summary-card co-summary">
              <h2>
                Your order <span className="count-chip">{count}</span>
              </h2>
              <ul className="co-items">
                {lines.map((l) => (
                  <li key={l.productId}>
                    <span className="co-thumb">
                      <ProductMedia product={{ ...l, package_size: l.size }} />
                      <b>{l.quantity}</b>
                    </span>
                    <span className="co-item-text">
                      <strong>{l.name}</strong>
                      <small>{formatRWF(l.price)} each</small>
                    </span>
                    <strong>{formatRWF(l.price * l.quantity)}</strong>
                  </li>
                ))}
              </ul>
              <div className="summary-row">
                <span>Products</span>
                <strong>{formatRWF(subtotal)}</strong>
              </div>
              <div className="summary-row">
                <span>Delivery</span>
                <span className="muted">{isDelivery ? 'Paid to your rider' : 'Collection'}</span>
              </div>
              {isDelivery && place && (
                <div className="summary-row co-dest">
                  <span>
                    <MapPin size={14} /> To
                  </span>
                  <span>
                    {place.village}, {place.sector}, {place.district}
                  </span>
                </div>
              )}
              <div className="summary-row total">
                <span>Total</span>
                <span>{formatRWF(subtotal)}</span>
              </div>

              <div className="co-notice">
                <Truck size={16} /> <span>{DELIVERY_NOTICE}</span>
              </div>
              <label className="checkbox" data-error={errors.acknowledged ? 'true' : undefined}>
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => {
                    setAcknowledged(e.target.checked)
                    setErrors((er) => ({ ...er, acknowledged: undefined }))
                  }}
                  aria-invalid={errors.acknowledged ? 'true' : undefined}
                />
                <span>
                  I understand delivery is arranged and paid by me, and I agree to the{' '}
                  <Link to="/policies/terms" target="_blank">
                    terms
                  </Link>
                  .
                </span>
              </label>
              {errors.acknowledged && (
                <p className="field-error-text" role="alert">
                  {errors.acknowledged}
                </p>
              )}

              <button className="btn btn--primary btn--block btn--lg" style={{ marginTop: 18 }} disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner /> Placing order…
                  </>
                ) : (
                  <>
                    <Lock size={17} /> Place order · {formatRWF(subtotal)}
                  </>
                )}
              </button>
              <p className="small muted center" style={{ margin: '10px 0 0' }}>
                Your order is confirmed once payment is verified.
              </p>
            </div>
          </aside>
        </form>
      </div>
    </section>
  )
}
