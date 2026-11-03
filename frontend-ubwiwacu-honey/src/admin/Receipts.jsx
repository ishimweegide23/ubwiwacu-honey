import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Download, ExternalLink, Inbox, Mail, MailX, Printer, ReceiptText, RefreshCw, Search, Send } from 'lucide-react'
import { PageHead } from './AdminLayout.jsx'
import { ErrorState, Field, Loading, Modal, Notice, Pager, Spinner } from '../components/ui.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { adminApi, openProtectedFile } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatDateTime, formatNumber, formatRWF, isValidEmail } from '../lib/format.js'
import { PAYMENT_LABELS } from '../config/site.js'

const TABS = [
  { value: '', label: 'All receipts', icon: ReceiptText, tone: 'muted' },
  { value: 'sent', label: 'Emailed', icon: CheckCircle2, tone: 'success' },
  { value: 'pending', label: 'Not sent yet', icon: Clock, tone: 'warn' },
  { value: 'failed', label: 'Email failed', icon: MailX, tone: 'danger' },
]
const EMAIL_STATE = {
  sent: { cls: 'success', text: 'Emailed', icon: CheckCircle2 },
  pending: { cls: 'warn', text: 'Not sent', icon: Clock },
  failed: { cls: 'danger', text: 'Email failed', icon: AlertTriangle },
}

function useCounts(reloadKey) {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    let alive = true
    Promise.all(
      TABS.map((t) =>
        adminApi
          .receipts({ deliveryStatus: t.value, limit: 1 })
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

function ResendModal({ receipt, onClose, onDone }) {
  const toast = useToast()
  const [email, setEmail] = useState(receipt.customer_email || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!isValidEmail(email)) return setError('Enter a valid email address.')
    setBusy(true)
    try {
      const res = await adminApi.resendReceipt(receipt.id, email.trim() !== receipt.customer_email ? { email: email.trim() } : {})
      toast.success(`Receipt sent to ${res.data.sent_to}.`)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Send receipt ${receipt.receipt_number}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={send} disabled={busy}>
            {busy ? <Spinner /> : <Send size={16} />} Send receipt
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          The PDF receipt for order <strong>{receipt.order_number}</strong> ({formatRWF(receipt.amount_rwf)}) is attached to the email.
        </p>
        {!receipt.customer_email && <Notice icon={Mail}>This order has no email address. Enter the customer’s email to send it.</Notice>}
        <Field label="Send to" required error={error || undefined}>
          {(p) => <input {...p} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@gmail.com" autoFocus />}
        </Field>
      </div>
    </Modal>
  )
}

function Ticket({ r, onOpen, onResend }) {
  const state = EMAIL_STATE[r.delivery_status] || EMAIL_STATE.pending
  const StateIcon = state.icon
  return (
    <article className={`ticket ${r.correction_ref ? 'ticket--void' : ''}`}>
      <div className="ticket-head">
        <span className="ticket-mark">
          <ReceiptText size={18} />
        </span>
        <div>
          <strong>{r.receipt_number}</strong>
          <small>{formatDateTime(r.issued_at)}</small>
        </div>
        <span className={`ticket-state ticket-state--${state.cls}`}>
          <StateIcon size={13} /> {state.text}
        </span>
      </div>
      <div className="ticket-amount">{formatRWF(r.amount_rwf)}</div>
      <dl className="ticket-rows">
        <div>
          <dt>Order</dt>
          <dd>
            <Link to={`/admin/orders/${r.order_id}`}>{r.order_number}</Link>
          </dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>{r.customer_name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd className={r.customer_email ? '' : 'muted'}>{r.customer_email || 'none'}</dd>
        </div>
        <div>
          <dt>Paid by</dt>
          <dd>
            {PAYMENT_LABELS[r.payment_method] || r.payment_method}
            {r.transaction_ref && <code> {r.transaction_ref}</code>}
          </dd>
        </div>
      </dl>
      {r.correction_ref && <p className="ticket-note ticket-note--danger">{r.correction_ref}</p>}
      {r.delivery_status === 'failed' && r.delivery_error && <p className="ticket-note">{r.delivery_error}</p>}
      <div className="ticket-actions">
        <button className="btn btn--ghost btn--icon" title="Open PDF" aria-label={`Open ${r.receipt_number} PDF`} onClick={() => onOpen(r, 'pdf')}>
          <ExternalLink size={17} />
        </button>
        <button className="btn btn--ghost btn--icon" title="Printable view" aria-label={`Print ${r.receipt_number}`} onClick={() => onOpen(r, 'html')}>
          <Printer size={17} />
        </button>
        <button className="btn btn--ghost btn--icon" title="Download PDF" aria-label={`Download ${r.receipt_number}`} onClick={() => onOpen(r, 'pdf', true)}>
          <Download size={17} />
        </button>
        <button className={`btn btn--sm ${r.delivery_status === 'sent' ? 'btn--outline' : 'btn--primary'}`} onClick={() => onResend(r)}>
          <Send size={15} /> {r.delivery_status === 'sent' ? 'Resend' : 'Send'}
        </button>
      </div>
    </article>
  )
}

export default function Receipts() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const deliveryStatus = params.get('deliveryStatus') || ''
  const page = params.get('page') || '1'
  const [tick, setTick] = useState(0)
  const { data, meta, error, loading, reload } = useAsync(() => adminApi.receipts({ q, deliveryStatus, page, limit: 24 }), [q, deliveryStatus, page, tick])
  const counts = useCounts(tick)
  const [resending, setResending] = useState(null)
  const [retrying, setRetrying] = useState(false)

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  const refresh = () => setTick((t) => t + 1)

  const retryAll = async () => {
    setRetrying(true)
    try {
      const res = await adminApi.retryFailedReceipts()
      toast.info(res.data.skipped ? `Skipped: ${res.data.skipped}` : `Retried ${res.data.attempted}, sent ${res.data.sent}.`)
      refresh()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRetrying(false)
    }
  }

  const open = (r, kind, download = false) =>
    openProtectedFile(`/api/admin/receipts/${r.id}/${kind}`, { download, filename: `${r.receipt_number}.pdf` }).catch((e) => toast.error(e.message))

  const failed = counts.failed || 0
  const unsent = counts.pending || 0

  return (
    <>
      <PageHead
        title="Receipts"
        subtitle="A receipt is created automatically when a payment is verified: one receipt per payment, emailed as a PDF."
        actions={
          <>
            <button className="btn btn--outline btn--sm" onClick={refresh} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn btn--primary btn--sm" onClick={retryAll} disabled={retrying || !(failed + unsent)}>
              {retrying ? <Spinner /> : <Send size={15} />} Retry unsent emails{failed + unsent ? ` (${failed + unsent})` : ''}
            </button>
          </>
        }
      />

      <div className="pay-tabs pay-tabs--4" role="tablist" aria-label="Email status">
        {TABS.map((t) => {
          const Icon = t.icon
          const n = counts[t.value]
          return (
            <button key={t.label} role="tab" aria-selected={deliveryStatus === t.value} className={`pay-tab pay-tab--${t.tone}`} onClick={() => set('deliveryStatus', t.value)}>
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
        <span className="small muted">{meta ? `${formatNumber(meta.total)} receipt${meta.total === 1 ? '' : 's'}` : ''}</span>
        <form
          className="search-pill"
          onSubmit={(e) => {
            e.preventDefault()
            set('q', new FormData(e.currentTarget).get('q')?.toString().trim())
          }}
        >
          <Search size={16} />
          <input name="q" defaultValue={q} key={q} placeholder="Receipt #, order #, customer" aria-label="Search receipts" />
        </form>
      </div>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <div className="panel panel-body empty-mini" style={{ padding: 56 }}>
          <Inbox size={30} />
          <strong>{q || deliveryStatus ? 'No receipts match' : 'No receipts yet'}</strong>
          <span>{q || deliveryStatus ? 'Try another tab or search.' : 'Receipts appear here after you verify a payment.'}</span>
        </div>
      ) : (
        <>
          <div className={`ticket-grid ${loading ? 'is-busy' : ''}`}>
            {data.map((r) => (
              <Ticket key={r.id} r={r} onOpen={open} onResend={setResending} />
            ))}
          </div>
          <Pager meta={meta} onPage={(n) => set('page', String(n))} />
        </>
      )}

      {resending && (
        <ResendModal
          receipt={resending}
          onClose={() => setResending(null)}
          onDone={() => {
            setResending(null)
            refresh()
          }}
        />
      )}
    </>
  )
}
