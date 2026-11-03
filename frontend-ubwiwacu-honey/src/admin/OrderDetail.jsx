import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, CheckCircle2, Download, ExternalLink, FileText, Mail, Phone, Printer, RefreshCw, Send, Truck, Undo2, XCircle } from 'lucide-react'
import { WhatsAppIcon } from '../components/Brand.jsx'
import { ErrorState, Field, FulfilmentBadge, fulfilmentText, Loading, Modal, Notice, PaymentBadge, Spinner } from '../components/ui.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { adminApi, openProtectedFile } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatDateTime, formatRWF, humanize } from '../lib/format.js'
import { PAYMENT_LABELS } from '../config/site.js'

function VerifyModal({ order, onClose, onDone }) {
  const toast = useToast()
  const pending = order.payments.find((p) => p.status === 'verification') || order.payments.find((p) => p.status === 'pending')
  const [method, setMethod] = useState(pending?.method && pending.method !== 'gateway' ? pending.method : 'mtn_momo')
  const [ref, setRef] = useState(pending?.transaction_ref || '')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (method !== 'cash' && !ref.trim()) return setError('A transaction reference is required for non-cash payments.')
    if (!confirm) return setError('Confirm that you checked the funds were received.')
    setBusy(true)
    try {
      const res = await adminApi.verifyPayment(order.id, {
        payment_id: pending?.id,
        method,
        transaction_ref: ref.trim() || undefined,
        note: note.trim() || undefined,
      })
      toast.success(`Payment verified. Receipt ${res.data.receipt?.receipt_number} issued.`)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Verify payment · ${order.order_number}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--forest" onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : <CheckCircle2 size={17} />} Mark as paid &amp; issue receipt
          </button>
        </>
      }
    >
      <div className="stack">
        <Notice variant="info">
          Only mark as paid after checking your MoMo / Airtel / bank statement shows <strong>{formatRWF(order.total_rwf)}</strong> received.
        </Notice>
        <div className="form-grid">
          <Field label="Method" required>
            {(p) => (
              <select {...p} className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
                {['mtn_momo', 'airtel', 'bank', 'cash'].map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABELS[m]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Transaction reference" required={method !== 'cash'}>
            {(p) => <input {...p} className="input" value={ref} onChange={(e) => setRef(e.target.value)} />}
          </Field>
          <Field label="Note (optional)" className="full">
            {(p) => <input {...p} className="input" value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span>I confirm the funds were actually received.</span>
        </label>
        {error && <Notice variant="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

function ReasonModal({ title, label, confirmText, variant = 'danger', onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!reason.trim()) return setError('A reason is required.')
    setBusy(true)
    try {
      await onSubmit(reason.trim())
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--outline" onClick={onClose}>
            Back
          </button>
          <button className={`btn btn--${variant}`} onClick={submit} disabled={busy}>
            {busy && <Spinner />} {confirmText}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label={label} required>
          {(p) => <textarea {...p} className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />}
        </Field>
        {error && <Notice variant="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const toast = useToast()
  const { data: order, error, loading, reload } = useAsync(() => adminApi.order(id), [id])
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(null)

  if (loading && !order) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const done = () => {
    setModal(null)
    reload()
  }
  const changeStatus = async (status, note) => {
    setBusy(status)
    try {
      await adminApi.updateStatus(order.id, { status, note })
      toast.success(`Status changed to ${fulfilmentText(status)}.`)
      done()
    } catch (err) {
      toast.error(err.message)
      throw err
    } finally {
      setBusy(null)
    }
  }
  const resend = async (receiptId) => {
    setBusy(`resend-${receiptId}`)
    try {
      const res = await adminApi.resendReceipt(receiptId, {})
      toast.success(`Receipt sent to ${res.data.sent_to}.`)
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  const canVerify = !['paid', 'refunded'].includes(order.payment_status) && !['cancelled', 'refunded'].includes(order.fulfilment_status)
  const canReject = order.payments.some((p) => ['verification', 'pending'].includes(p.status)) && order.payment_status !== 'paid'
  const forwardSteps = order.allowed_transitions.filter((s) => !['cancelled', 'refunded'].includes(s))
  const isPos = order.source === 'pos'

  return (
    <>
      <Link to="/admin/orders" className="link-arrow small" style={{ marginBottom: 12 }}>
        <ArrowLeft size={16} /> All orders
      </Link>
      <div className="od-hero">
        <div className="od-hero-main">
          <span className="od-eyebrow">
            Order · {humanize(order.source)} · {formatDateTime(order.created_at)}
          </span>
          <h1>{order.order_number}</h1>
          <div className="od-hero-meta">
            <span>
              <strong>{order.customer_name}</strong> · {order.customer_phone}
            </span>
            <span className="od-total">{formatRWF(order.total_rwf)}</span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <PaymentBadge status={order.payment_status} />
            <FulfilmentBadge status={order.fulfilment_status} />
            <span className="badge badge--muted">{humanize(order.fulfilment_type)}</span>
          </div>
        </div>
        <div className="row od-hero-actions">
          <Link to={'/admin/orders/' + order.id + '/invoice'} className="btn btn--outline btn--sm">
            <FileText size={16} /> Invoice
          </Link>
          {canVerify && (
            <button className="btn btn--forest btn--sm" onClick={() => setModal('verify')}>
              <CheckCircle2 size={16} /> Verify payment
            </button>
          )}
          {canReject && (
            <button className="btn btn--outline btn--sm" onClick={() => setModal('reject')}>
              <XCircle size={16} /> Reject reference
            </button>
          )}
          {forwardSteps.map((s) => (
            <button key={s} className="btn btn--dark btn--sm" onClick={() => changeStatus(s).catch(() => {})} disabled={busy === s}>
              {busy === s ? <Spinner /> : <Truck size={16} />} Mark {fulfilmentText(s).toLowerCase()}
            </button>
          ))}
          {order.allowed_transitions.includes('refunded') && !isPos && (
            <button className="btn btn--outline btn--sm" onClick={() => setModal('refund')}>
              <Undo2 size={16} /> Refund
            </button>
          )}
          {isPos && order.payment_status === 'paid' && (
            <button className="btn btn--outline btn--sm" onClick={() => setModal('void')}>
              <Undo2 size={16} /> Void sale
            </button>
          )}
          {order.allowed_transitions.includes('cancelled') && !isPos && (
            <button className="btn btn--ghost btn--sm" style={{ color: 'var(--danger)' }} onClick={() => setModal('cancel')}>
              <Ban size={16} /> Cancel order
            </button>
          )}
        </div>
      </div>

      {order.payment_status === 'verification' && (
        <div style={{ marginBottom: 20 }}>
          <Notice variant="info" title="Customer submitted a payment reference.">
            Check it against your statement, then verify or reject it.
          </Notice>
        </div>
      )}

      <div className="two-col">
        <div className="stack" style={{ gap: 20 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>Items</h2>
              <span className="small muted">Prices frozen at time of order</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Size</th>
                    <th className="num">Unit price</th>
                    <th className="num">Qty</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id}>
                      <td className="strong">{i.product_name}</td>
                      <td>{i.package_size}</td>
                      <td className="num">{formatRWF(i.unit_price_rwf)}</td>
                      <td className="num">{i.quantity}</td>
                      <td className="num strong">{formatRWF(i.line_total_rwf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-body" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="kv" style={{ maxWidth: 340, marginLeft: 'auto' }}>
                <div>
                  <span>Subtotal</span>
                  <span>{formatRWF(order.subtotal_rwf)}</span>
                </div>
                <div>
                  <span>Discount</span>
                  <span>{formatRWF(order.discount_rwf)}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                  <span style={{ color: 'var(--ink)' }}>Total</span>
                  <span>{formatRWF(order.total_rwf)}</span>
                </div>
                <div>
                  <span>Paid</span>
                  <span>{formatRWF(order.amount_paid_rwf)}</span>
                </div>
                <div>
                  <span>Balance</span>
                  <span>{formatRWF(order.balance_rwf)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Payments</h2>
            </div>
            {order.payments.length === 0 ? (
              <p className="panel-body muted mb-0">No payment recorded yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Status</th>
                      <th>Verified</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{PAYMENT_LABELS[p.method] || p.method}</td>
                        <td className="mono">{p.transaction_ref || p.provider_reference || '—'}</td>
                        <td>
                          <PaymentBadge status={p.status} />
                          {p.rejection_reason && <div className="small muted" style={{ marginTop: 4 }}>{p.rejection_reason}</div>}
                        </td>
                        <td className="small">
                          {p.verified_at ? (
                            <>
                              {formatDateTime(p.verified_at)}
                              <br />
                              <span className="muted">by {p.verified_by_name || (p.method === 'gateway' ? 'gateway' : '—')}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="num strong">{formatRWF(p.amount_rwf)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Receipts</h2>
            </div>
            {order.receipts.length === 0 ? (
              <p className="panel-body muted mb-0">A receipt is issued automatically when the payment is verified.</p>
            ) : (
              <ul className="list-plain">
                {order.receipts.map((r) => (
                  <li key={r.id} style={{ flexWrap: 'wrap' }}>
                    <div>
                      <strong>{r.receipt_number}</strong> · {formatRWF(r.amount_rwf)}
                      <div className="small muted">
                        Issued {formatDateTime(r.issued_at)} · Email: {r.delivery_status}
                        {r.delivery_error ? ` (${r.delivery_error})` : ''}
                      </div>
                      {r.correction_ref && <div className="small" style={{ color: 'var(--danger)' }}>Correction: {r.correction_ref}</div>}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn--outline btn--sm" onClick={() => openProtectedFile(`/api/admin/receipts/${r.id}/pdf`).catch((e) => toast.error(e.message))}>
                        <ExternalLink size={15} /> PDF
                      </button>
                      <button className="btn btn--outline btn--sm" onClick={() => openProtectedFile(`/api/admin/receipts/${r.id}/html`).catch((e) => toast.error(e.message))}>
                        <Printer size={15} /> Print
                      </button>
                      <button
                        className="btn btn--outline btn--sm"
                        onClick={() =>
                          openProtectedFile(`/api/admin/receipts/${r.id}/pdf`, { download: true, filename: `${r.receipt_number}.pdf` }).catch((e) => toast.error(e.message))
                        }
                      >
                        <Download size={15} />
                      </button>
                      <button className="btn btn--dark btn--sm" onClick={() => resend(r.id)} disabled={busy === `resend-${r.id}`}>
                        {busy === `resend-${r.id}` ? <Spinner /> : <Send size={15} />} Resend
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 20 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>Customer</h2>
            </div>
            <div className="panel-body stack" style={{ gap: 10 }}>
              <strong style={{ fontSize: '1.05rem' }}>{order.customer_name}</strong>
              {order.customer_phone && order.customer_phone !== 'N/A' && (
                <div className="row" style={{ gap: 6 }}>
                  <a className="btn btn--outline btn--sm" href={`tel:${order.customer_phone}`}>
                    <Phone size={15} /> {order.customer_phone}
                  </a>
                  <a
                    className="btn btn--whatsapp btn--sm"
                    href={`https://wa.me/${order.customer_phone.replace(/\D/g, '').replace(/^0/, '250')}?text=${encodeURIComponent(`Hello ${order.customer_name}, this is Ubw'iwacu Honey about your order ${order.order_number}.`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <WhatsAppIcon size={15} />
                  </a>
                </div>
              )}
              {order.customer_email && (
                <a href={`mailto:${order.customer_email}`} className="row small" style={{ gap: 6 }}>
                  <Mail size={15} /> {order.customer_email}
                </a>
              )}
              {order.entered_by_name && (
                <div className="small muted">
                  Entered by {order.entered_by_name}
                  {order.entry_note && <> · “{order.entry_note}”</>}
                </div>
              )}
              {order.notes && <Notice>{order.notes}</Notice>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{order.fulfilment_type === 'delivery' ? 'Delivery' : 'Collection'}</h2>
            </div>
            <div className="panel-body">
              {order.fulfilment_type === 'delivery' ? (
                <dl className="def-list">
                  <dt>Recipient</dt>
                  <dd>{order.delivery_recipient_name}</dd>
                  <dt>Phone</dt>
                  <dd>{order.delivery_phone}</dd>
                  {order.delivery_email && (
                    <>
                      <dt>Email</dt>
                      <dd>{order.delivery_email}</dd>
                    </>
                  )}
                  <dt>District</dt>
                  <dd>
                    {order.delivery_district}
                    {order.delivery_province ? `, ${order.delivery_province}` : ''}
                  </dd>
                  <dt>Sector</dt>
                  <dd>{order.delivery_sector}</dd>
                  <dt>Cell</dt>
                  <dd>{order.delivery_cell}</dd>
                  <dt>Village</dt>
                  <dd>{order.delivery_village}</dd>
                  <dt>Landmark</dt>
                  <dd>{order.delivery_landmark}</dd>
                  {order.delivery_address && (
                    <>
                      <dt>Street address</dt>
                      <dd>{order.delivery_address}</dd>
                    </>
                  )}
                  {order.delivery_location_code && (
                    <>
                      <dt>Village code</dt>
                      <dd>
                        <code>{order.delivery_location_code}</code>
                      </dd>
                    </>
                  )}
                  {order.delivery_preferred_time && (
                    <>
                      <dt>Preferred</dt>
                      <dd>{order.delivery_preferred_time}</dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="muted mb-0">Customer will collect. Contact them to confirm time and place.</p>
              )}
              <p className="small muted" style={{ margin: '12px 0 0' }}>
                Delivery is arranged and paid by the customer.
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>History</h2>
              <button className="btn btn--ghost btn--sm" onClick={reload} aria-label="Refresh">
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="panel-body">
              <ul className="history">
                {order.history.map((h) => (
                  <li key={h.id}>
                    <span className="dot" />
                    <span>
                      <strong>{humanize(h.action.replace('.', ' · '))}</strong>
                      {h.details?.to && <> → {fulfilmentText(h.details.to)}</>}
                      {h.details?.reason && <span className="muted"> · {h.details.reason}</span>}
                      {h.details?.rejection_reason && <span className="muted"> · {h.details.rejection_reason}</span>}
                      <br />
                      <span className="small muted">
                        {formatDateTime(h.created_at)} · {h.user_name || 'Customer / system'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {modal === 'verify' && <VerifyModal order={order} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'reject' && (
        <ReasonModal
          title="Reject payment reference"
          label="Reason (shown to the customer)"
          confirmText="Reject"
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            await adminApi.rejectPayment(order.id, { rejection_reason: reason })
            toast.success('Payment reference rejected.')
            done()
          }}
        />
      )}
      {modal === 'cancel' && (
        <ReasonModal
          title="Cancel order"
          label="Cancellation reason"
          confirmText="Cancel order & restore stock"
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            await adminApi.cancelOrder(order.id, { reason })
            toast.success('Order cancelled and stock restored.')
            done()
          }}
        />
      )}
      {modal === 'refund' && (
        <ReasonModal title="Refund order" label="Refund reason" confirmText="Record refund" onClose={() => setModal(null)} onSubmit={(reason) => changeStatus('refunded', reason)} />
      )}
      {modal === 'void' && (
        <ReasonModal
          title="Void POS sale"
          label="Reason for voiding"
          confirmText="Void sale"
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            await adminApi.posVoid(order.id, { reason })
            toast.success('Sale voided. Stock restored.')
            done()
          }}
        />
      )}
    </>
  )
}
