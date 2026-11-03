import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { PageHead } from './AdminLayout.jsx'
import { ErrorState, Field, Loading, Notice, QtyStepper, Spinner } from '../components/ui.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { adminApi } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatRWF, isValidEmail, isValidPhone, uuid } from '../lib/format.js'
import { PAYMENT_LABELS } from '../config/site.js'

const DELIVERY = [
  ['delivery_recipient_name', 'Recipient name', true],
  ['delivery_phone', 'Recipient phone', true],
  ['delivery_district', 'District', true],
  ['delivery_sector', 'Sector', true],
  ['delivery_cell', 'Cell', true],
  ['delivery_village', 'Village', true],
  ['delivery_landmark', 'Landmark', true],
  ['delivery_preferred_time', 'Preferred time', false],
]

export default function NewOrder() {
  const navigate = useNavigate()
  const toast = useToast()
  const idem = useMemo(() => uuid(), [])
  const { data: products, error, loading, reload } = useAsync(() => adminApi.products({ available: true, limit: 100 }), [])
  const [qty, setQty] = useState({})
  const [form, setForm] = useState({
    source: 'whatsapp',
    entry_note: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    fulfilment_type: 'delivery',
    payment_method: 'mtn_momo',
    notes: '',
    ...Object.fromEntries(DELIVERY.map(([k]) => [k, ''])),
  })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  if (loading && !products) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const lines = products.filter((p) => qty[p.id] > 0).map((p) => ({ ...p, quantity: qty[p.id] }))
  const total = lines.reduce((s, l) => s + l.price_rwf * l.quantity, 0)

  const submit = async (e) => {
    e.preventDefault()
    const er = {}
    if (!lines.length) er.items = 'Add at least one product'
    if (!form.entry_note.trim()) er.entry_note = 'Describe where this order came from'
    if (!form.customer_name.trim()) er.customer_name = 'Required'
    if (!isValidPhone(form.customer_phone)) er.customer_phone = 'Valid phone required'
    if (form.customer_email && !isValidEmail(form.customer_email)) er.customer_email = 'Invalid email'
    if (form.fulfilment_type === 'delivery') {
      for (const [k, , req] of DELIVERY) if (req && !form[k].trim()) er[k] = 'Required'
      if (form.delivery_phone && !isValidPhone(form.delivery_phone)) er.delivery_phone = 'Valid phone required'
    }
    setErrors(er)
    if (Object.keys(er).length) return

    const body = { ...form, items: lines.map((l) => ({ productId: l.id, quantity: l.quantity })), idempotencyKey: idem }
    for (const k of Object.keys(body)) if (body[k] === '') delete body[k]
    setBusy(true)
    try {
      await adminApi.createManualOrder(body)
      toast.success('Manual order created.')
      const list = await adminApi.orders({ q: form.customer_phone, limit: 1 })
      navigate(list.data[0] ? `/admin/orders/${list.data[0].id}` : '/admin/orders')
    } catch (err) {
      setErrors({ ...err.fieldErrors, form: err.errors?.length ? `${err.message}: ${err.errors.map((x) => x.message).join('; ')}` : err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Link to="/admin/orders" className="link-arrow small" style={{ marginBottom: 12 }}>
        <ArrowLeft size={16} /> All orders
      </Link>
      <PageHead title="Manual order" subtitle="Record an order received by WhatsApp, phone or Instagram. Prices come from the catalogue." />
      {errors.form && (
        <div style={{ marginBottom: 16 }}>
          <Notice variant="danger">{errors.form}</Notice>
        </div>
      )}
      <div className="two-col">
        <div className="stack" style={{ gap: 20 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>Products</h2>
              {errors.items && <span className="small" style={{ color: 'var(--danger)' }}>{errors.items}</span>}
            </div>
            <ul className="list-plain">
              {products.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <div className="small muted">
                      {formatRWF(p.price_rwf)} · {p.stock_qty} in stock
                    </div>
                  </div>
                  <QtyStepper size="sm" min={0} max={p.stock_qty} value={qty[p.id] || 0} onChange={(v) => setQty({ ...qty, [p.id]: v })} label={`Quantity of ${p.name}`} />
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <div className="panel-head">
              <h2>Customer &amp; fulfilment</h2>
            </div>
            <div className="panel-body form-grid">
              <Field label="Customer name" required error={errors.customer_name}>
                {(p) => <input {...p} className="input" value={form.customer_name} onChange={set('customer_name')} />}
              </Field>
              <Field label="Customer phone" required error={errors.customer_phone}>
                {(p) => <input {...p} className="input" type="tel" value={form.customer_phone} onChange={set('customer_phone')} />}
              </Field>
              <Field label="Customer email" error={errors.customer_email}>
                {(p) => <input {...p} className="input" type="email" value={form.customer_email} onChange={set('customer_email')} />}
              </Field>
              <Field label="Fulfilment">
                {(p) => (
                  <select {...p} className="select" value={form.fulfilment_type} onChange={set('fulfilment_type')}>
                    <option value="delivery">Delivery (customer-arranged)</option>
                    <option value="collection">Collection</option>
                  </select>
                )}
              </Field>
              {form.fulfilment_type === 'delivery' &&
                DELIVERY.map(([k, label, req]) => (
                  <Field key={k} label={label} required={req} error={errors[k]}>
                    {(p) => <input {...p} className="input" value={form[k]} onChange={set(k)} />}
                  </Field>
                ))}
              <Field label="Order notes" className="full">
                {(p) => <textarea {...p} className="textarea" style={{ minHeight: 70 }} value={form.notes} onChange={set('notes')} />}
              </Field>
            </div>
          </div>
        </div>

        <div className="panel" style={{ position: 'sticky', top: 84 }}>
          <div className="panel-head">
            <h2>Order source</h2>
          </div>
          <div className="panel-body stack">
            <Field label="Received via" required>
              {(p) => (
                <select {...p} className="select" value={form.source} onChange={set('source')}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="phone">Phone call</option>
                  <option value="instagram">Instagram</option>
                </select>
              )}
            </Field>
            <Field label="Entry note" required error={errors.entry_note} hint="Saved with the order and in the audit log.">
              {(p) => <textarea {...p} className="textarea" style={{ minHeight: 80 }} value={form.entry_note} onChange={set('entry_note')} placeholder="e.g. WhatsApp chat on 30 Oct, customer confirmed 2 × 1 kg" />}
            </Field>
            <Field label="Payment method">
              {(p) => (
                <select {...p} className="select" value={form.payment_method} onChange={set('payment_method')}>
                  {['mtn_momo', 'airtel', 'bank', 'cash'].map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="summary-row total" style={{ marginTop: 0 }}>
              <span>Total</span>
              <span>{formatRWF(total)}</span>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              The order starts as awaiting payment. Verify the payment from the order page once funds are received.
            </p>
            <button className="btn btn--primary btn--block" disabled={busy}>
              {busy ? <Spinner /> : <Save size={17} />} Create order
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
