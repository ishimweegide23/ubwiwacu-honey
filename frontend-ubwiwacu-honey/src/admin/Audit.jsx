import { useState } from 'react'
import { PageHead } from './AdminLayout.jsx'
import { ErrorState, Loading, Pager } from '../components/ui.jsx'
import { adminApi } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatDateTime } from '../lib/format.js'

const ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'product.create',
  'product.update',
  'product.delete',
  'product.image',
  'stock.adjust',
  'order.create',
  'order.manual_create',
  'order.status',
  'order.cancel',
  'order.refund',
  'payment.submit_reference',
  'payment.verify',
  'payment.reject',
  'payment.webhook',
  'receipt.issue',
  'receipt.resend',
  'pos.sale',
  'pos.void',
]

function summary(a) {
  const d = a.details || {}
  if (a.action === 'stock.adjust') return `${d.before} → ${d.after} (${d.delta > 0 ? '+' : ''}${d.delta}) · ${d.reason || ''}`
  if (a.action === 'product.update' && d.changes)
    return Object.entries(d.changes)
      .map(([k, v]) => `${k}: ${v.from} → ${v.to}`)
      .join(', ')
  return [d.order_number, d.receipt_number, d.reason, d.rejection_reason, d.transaction_ref, d.email, d.to && `→ ${d.to}`]
    .filter(Boolean)
    .join(' · ')
}

export default function Audit() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const { data, meta, error, loading, reload } = useAsync(() => adminApi.audit({ action, page, limit: 30 }), [action, page])

  return (
    <>
      <PageHead title="Audit log" subtitle="Every administrative change and stock movement, with who did it and when." />
      <div className="panel">
        <div className="toolbar">
          <select
            className="select"
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Details</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={5} className="table-empty">
                        No entries.
                      </td>
                    </tr>
                  )}
                  {data.map((a) => (
                    <tr key={a.id}>
                      <td className="small" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(a.created_at)}
                      </td>
                      <td>{a.user_name || <span className="muted">Customer / system</span>}</td>
                      <td>
                        <span className="badge badge--muted mono">{a.action}</span>
                      </td>
                      <td className="small" style={{ maxWidth: 420 }}>
                        {summary(a) || <span className="muted">{a.record_type}</span>}
                      </td>
                      <td className="small muted mono">{a.ip || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={meta} onPage={setPage} />
          </>
        )}
      </div>
    </>
  )
}
