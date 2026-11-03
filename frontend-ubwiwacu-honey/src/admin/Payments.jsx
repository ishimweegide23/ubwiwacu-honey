import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Ban, Building, CheckCircle2, ClipboardCheck, Copy, Hourglass, Inbox, Layers, RefreshCw, Search, Smartphone, Wallet, X, XCircle } from 'lucide-react'
import { PageHead } from './AdminLayout.jsx'
import { ErrorState, Field, Loading, Modal, Notice, Pager, PaymentBadge, Spinner } from '../components/ui.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { adminApi } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatDateTime, formatNumber, formatRWF, timeAgo } from '../lib/format.js'
import { PAYMENT_LABELS } from '../config/site.js'

const TABS = [
  { value: 'verification', label: 'To verify', icon: Hourglass, tone: 'warn' },
  { value: 'pending', label: 'Awaiting customer', icon: Wallet, tone: 'muted' },
  { value: 'paid', label: 'Verified', icon: CheckCircle2, tone: 'success' },
  { value: 'rejected', label: 'Rejected', icon: Ban, tone: 'danger' },
  { value: '', label: 'All payments', icon: Layers, tone: 'muted' },
]

const CHANNEL_LABEL = { push: 'Phone prompt', reference: 'Reference', manual: 'Manual' }

const METHOD_ICON ={ mtn_momo: Smartphone, airtel: Smartphone, bank: Building, cash: Wallet }

const REJECT_REASONS = [
  'Reference not found on our statement',
  'Amount received is less than the order total',
  'Reference already used for another order',
  'Payment sent to the wrong account',
]

function MethodChip({ method }) {
  const Icon = METHOD_ICON[method] || Wallet
  return (
    <span className={`method-chip method-chip--${method}`}>
      <Icon size={13} /> {PAYMENT_LABELS[method] || method}
    </span>
  )
}

/** Live counts per status for the tab cards (one tiny request each). */
function useCounts(reloadKey) {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    let alive = true
    Promise.all(
      TABS.map((t) =>
        adminApi
          .payments({ status: t.value, limit: 1 })
          .then((r) => [t.value, r.pagination?.total ?? 0])
          .catch(() => [t.value, null]),
      ),
    ).then((pairs) => alive && setCounts(Object.fromEntries(pairs)))
    return () => {
      alive = false
    }
  }, [reloadKey])
  return counts
}

function VerifyModal({ payment, onClose, onDone }) {
  const toast = useToast()
  const [ref, setRef] = useState(payment.transaction_ref || '')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mismatch = payment.amount_rwf && payment.order_total_rwf && payment.amount_rwf !== payment.order_total_rwf

  const submit = async () => {
    if (payment.method !== 'cash' && !ref.trim()) return setError('A transaction reference is required for non-cash payments.')
    if (!confirm) return setError('Tick the box to confirm you checked the money arrived.')
    setBusy(true)
    try {
      const res = await adminApi.verifyPayment(payment.order_id, {
        payment_id: payment.id,
        method: payment.method,
        transaction_ref: ref.trim() || undefined,
        note: note.trim() || undefined,
      })
      toast.success(`Payment verified. Receipt ${res.data.receipt?.receipt_number || ''} issued.`)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Verify payment · ${payment.order_number}`}
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
        <div className="verify-sum">
          <div>
            <span>Customer paid</span>
            <strong>{formatRWF(payment.amount_rwf || payment.order_total_rwf)}</strong>
          </div>
          <div>
            <span>Order total</span>
            <strong>{formatRWF(payment.order_total_rwf)}</strong>
          </div>
          <div>
            <span>Method</span>
            <MethodChip method={payment.method} />
          </div>
        </div>
        {mismatch && (
          <Notice variant="danger" icon={AlertTriangle}>
            The amount does not match the order total. Only verify if the full amount reached your account.
          </Notice>
        )}
        <Notice variant="info">
          Open your {PAYMENT_LABELS[payment.method] || 'payment'} statement and find reference <strong>{payment.transaction_ref || '—'}</strong> for{' '}
          <strong>{formatRWF(payment.order_total_rwf)}</strong> before you continue.
        </Notice>
        <Field label="Transaction reference" required={payment.method !== 'cash'}>
          {(p) => <input {...p} className="input mono" value={ref} onChange={(e) => setRef(e.target.value)} />}
        </Field>
        <Field label="Note (optional)" hint="Saved in the audit log.">
          {(p) => <input {...p} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Seen on MoMo statement 31 Oct" />}
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span>I checked the statement and the money was received.</span>
        </label>
        {error && <Notice variant="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

function RejectModal({ payment, onClose, onDone }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!reason.trim()) return setError('Tell the customer why, so they can fix it.')
    setBusy(true)
    try {
      await adminApi.rejectPayment(payment.order_id, { payment_id: payment.id, rejection_reason: reason.trim() })
      toast.success('Reference rejected. The customer can submit a new one.')
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Reject reference · ${payment.order_number}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--danger" onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : <XCircle size={17} />} Reject reference
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          The customer sees this reason on their order page and can send a new reference.
        </p>
        <div className="quick-qty" style={{ marginTop: 0 }}>
          {REJECT_REASONS.map((r) => (
            <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        <Field label="Reason" required>
          {(p) => <textarea {...p} className="textarea" style={{ minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
        </Field>
        {error && <Notice variant="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

/** A payment waiting for verification. */
function QueueCard({ p, onVerify, onReject }) {
  const toast = useToast()
  const ref = p.transaction_ref || p.provider_reference
  const mismatch = p.amount_rwf && p.order_total_rwf && p.amount_rwf !== p.order_total_rwf
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref)
      toast.success('Reference copied.')
    } catch {
      /* ignore */
    }
  }
  return (
    <article className="pq-card">
      <div className="pq-top">
        <MethodChip method={p.method} />
        <span className="pq-time" title={formatDateTime(p.updated_at)}>
          {timeAgo(p.updated_at)}
        </span>
      </div>
      <div className="pq-ref">
        <span>Transaction reference</span>
        <div>
          <code>{ref || '—'}</code>
          {ref && (
            <button onClick={copy} aria-label="Copy reference">
              <Copy size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="pq-amount">
        <strong>{formatRWF(p.amount_rwf || p.order_total_rwf)}</strong>
        {mismatch ? (
          <span className="pq-warn">
            <AlertTriangle size={13} /> Order total {formatRWF(p.order_total_rwf)}
          </span>
        ) : (
          <span className="pq-ok">
            <CheckCircle2 size={13} /> Matches order total
          </span>
        )}
      </div>
      <div className="pq-who">
        <Link to={`/admin/orders/${p.order_id}`} className="order-no">
          {p.order_number}
        </Link>
        <span>
          {p.customer_name} · {p.customer_phone}
        </span>
      </div>
      <div className="pq-actions">
        <button className="btn btn--forest btn--sm" onClick={() => onVerify(p)}>
          <ClipboardCheck size={15} /> Verify
        </button>
        <button className="btn btn--outline btn--sm" onClick={() => onReject(p)}>
          <X size={15} /> Reject
        </button>
      </div>
    </article>
  )
}

export default function Payments() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.has('status') ? params.get('status') : 'verification'
  const q = params.get('q') || ''
  const page = params.get('page') || '1'
  const [tick, setTick] = useState(0)
  const { data, meta, error, loading, reload } = useAsync(() => adminApi.payments({ status, q, page, limit: 24 }), [status, q, page, tick])
  const counts = useCounts(tick)
  const [verifying, setVerifying] = useState(null)
  const [rejecting, setRejecting] = useState(null)

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    next.set(k, v)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  const refresh = () => setTick((t) => t + 1)
  const done = () => {
    setVerifying(null)
    setRejecting(null)
    refresh()
  }
  const queue = status === 'verification'
  const queueTotal = queue && data ? data.reduce((s, p) => s + (p.amount_rwf || p.order_total_rwf || 0), 0) : 0

  return (
    <>
      <PageHead
        title="Payments"
        subtitle="Check each reference against your MoMo, Airtel or bank statement before verifying. Revenue counts verified payments only."
        actions={
          <button className="btn btn--outline btn--sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="pay-tabs" role="tablist" aria-label="Payment status">
        {TABS.map((t) => {
          const Icon = t.icon
          const n = counts[t.value]
          return (
            <button key={t.label} role="tab" aria-selected={status === t.value} className={`pay-tab pay-tab--${t.tone}`} onClick={() => set('status', t.value)}>
              <span className="pay-tab-icon">
                <Icon size={17} />
              </span>
              <span className="pay-tab-text">
                <strong>{n == null ? '–' : formatNumber(n)}</strong>
                <small>{t.label}</small>
              </span>
            </button>
          )
        })}
      </div>

      <div className="list-bar">
        <span className="small muted">
          {queue && data?.length ? (
            <>
              <strong className="pq-sum">{formatRWF(queueTotal)}</strong> waiting to be confirmed on this page
            </>
          ) : meta ? (
            `${formatNumber(meta.total)} payment${meta.total === 1 ? '' : 's'}`
          ) : (
            ''
          )}
        </span>
        <form
          className="search-pill"
          onSubmit={(e) => {
            e.preventDefault()
            set('q', new FormData(e.currentTarget).get('q')?.toString().trim() || '')
          }}
        >
          <Search size={16} />
          <input name="q" defaultValue={q} key={q} placeholder="Reference, order #, customer" aria-label="Search payments" />
        </form>
      </div>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <div className="panel panel-body empty-mini" style={{ padding: 56 }}>
          {queue ? <CheckCircle2 size={34} style={{ color: 'var(--success)' }} /> : <Inbox size={30} />}
          <strong>{queue ? 'Nothing waiting for verification' : 'No payments found'}</strong>
          <span>{queue ? 'New references from customers appear here the moment they are sent.' : 'Try another status or search.'}</span>
        </div>
      ) : queue ? (
        <>
          <div className={`pq-grid ${loading ? 'is-busy' : ''}`}>
            {data.map((p) => (
              <QueueCard key={p.id} p={p} onVerify={setVerifying} onReject={setRejecting} />
            ))}
          </div>
          <Pager meta={meta} onPage={(n) => set('page', String(n))} />
        </>
      ) : (
        <div className={`panel ${loading ? 'is-busy' : ''}`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Method</th>
                  <th>How paid</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/admin/orders/${p.order_id}`)}>
                    <td>
                      <Link to={`/admin/orders/${p.order_id}`} className="order-no" onClick={(e) => e.stopPropagation()}>
                        {p.order_number}
                      </Link>
                    </td>
                    <td>
                      {p.customer_name}
                      <div className="small muted">{p.customer_phone}</div>
                    </td>
                    <td>
                      <MethodChip method={p.method} />
                    </td>
                    <td>
                      <span className={`chan chan--${p.channel || 'reference'}`}>{CHANNEL_LABEL[p.channel] || 'Reference'}</span>
                      <div className="mono small">{p.transaction_ref || '—'}</div>
                      {p.channel === 'push' && (
                        <div className="small muted">
                          From {p.payer_phone}
                          {p.provider_status ? ` · ${p.provider_status}` : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <PaymentBadge status={p.status} />
                      {p.verified_by_name && <div className="small muted">by {p.verified_by_name}</div>}
                      {p.status === 'rejected' && p.rejection_reason && (
                        <div className="small" style={{ color: 'var(--danger)', maxWidth: 220 }}>
                          {p.rejection_reason}
                        </div>
                      )}
                    </td>
                    <td className="small" title={formatDateTime(p.updated_at)}>
                      {timeAgo(p.updated_at)}
                    </td>
                    <td className="num strong">{formatRWF(p.amount_rwf || p.order_total_rwf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager meta={meta} onPage={(n) => set('page', String(n))} />
        </div>
      )}

      {verifying && <VerifyModal payment={verifying} onClose={() => setVerifying(null)} onDone={done} />}
      {rejecting && <RejectModal payment={rejecting} onClose={() => setRejecting(null)} onDone={done} />}
    </>
  )
}
