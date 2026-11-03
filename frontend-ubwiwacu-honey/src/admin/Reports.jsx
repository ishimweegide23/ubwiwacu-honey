import { useState } from 'react'
import { AlertTriangle, Download, TrendingDown, TrendingUp } from 'lucide-react'
import { PageHead } from './AdminLayout.jsx'
import { ErrorState, Loading, Spinner } from '../components/ui.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { adminApi, openProtectedFile } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatDateTime, formatNumber, formatRWF, humanize, isoDate } from '../lib/format.js'

const TYPES = [
  { value: 'orders', label: 'Orders by period' },
  { value: 'sales_by_product', label: 'Sales by product' },
  { value: 'sales_by_size', label: 'Sales by size' },
  { value: 'sales_by_source', label: 'Sales by source' },
  { value: 'verified_payments', label: 'Verified payments' },
  { value: 'outstanding', label: 'Outstanding payments' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'best_sellers', label: 'Best sellers' },
]
const MONEY = /(_rwf|amount)$/
const DATE = /(_at|^verified_at)$/

function cell(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (MONEY.test(key)) return formatRWF(value)
  if (DATE.test(key)) return formatDateTime(value)
  if (typeof value === 'number') return formatNumber(value)
  if (['source', 'method', 'payment_status', 'fulfilment_status', 'fulfilment_type'].includes(key)) return humanize(value)
  return String(value)
}

function ProductAnalytics() {
  const { data, error, loading, reload } = useAsync(() => adminApi.productAnalytics(), [])
  if (loading && !data) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />
  const maxUnits = Math.max(1, ...data.products.map((p) => p.units_sold))

  return (
    <>
      <div className="stats">
        <div className="stat stat--hero">
          <div className="stat-top">Verified revenue (all time)</div>
          <div className="stat-value">{formatRWF(data.totals.revenue_rwf)}</div>
        </div>
        <div className="stat">
          <div className="stat-top">Units sold (paid)</div>
          <div className="stat-value">{formatNumber(data.totals.units_sold)}</div>
        </div>
        <div className="stat">
          <div className="stat-top">Units in stock</div>
          <div className="stat-value">{formatNumber(data.totals.stock_units)}</div>
        </div>
        <div className={`stat ${data.reorder_alerts.length ? 'stat--danger' : ''}`}>
          <div className="stat-top">
            Reorder alerts{' '}
            <span className="stat-icon">
              <AlertTriangle size={18} />
            </span>
          </div>
          <div className="stat-value">{data.reorder_alerts.length}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Product performance</h2>
          <span className="small muted">Velocity = units per day over the last {data.period_days} days</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Units sold</th>
                <th className="num">Revenue</th>
                <th className="num">Stock</th>
                <th className="num">Velocity</th>
                <th className="num">Days left</th>
                <th className="num">Suggested reorder</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.name}</td>
                  <td style={{ minWidth: 160 }}>
                    <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                      <span style={{ minWidth: 28 }}>{p.units_sold}</span>
                      <div className="mini-bar" style={{ flex: 1 }}>
                        <span style={{ width: `${(p.units_sold / maxUnits) * 100}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="num">{formatRWF(p.revenue_rwf)}</td>
                  <td className="num">
                    <span className={p.is_low_stock ? 'badge badge--danger' : ''}>{p.stock_remaining}</span>
                  </td>
                  <td className="num">{p.velocity_30d}/day</td>
                  <td className="num">{p.days_until_stockout ?? '—'}</td>
                  <td className="num">{p.suggested_reorder_qty || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 20 }}>
        <div className="panel">
          <div className="panel-head">
            <h2 className="row" style={{ gap: 8 }}>
              <TrendingUp size={18} style={{ color: 'var(--success)' }} /> Best sellers
            </h2>
          </div>
          <ul className="list-plain">
            {data.best_sellers.map((p, i) => (
              <li key={p.id}>
                <span>
                  {i + 1}. {p.name}
                </span>
                <strong>{p.units_sold} units</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2 className="row" style={{ gap: 8 }}>
              <TrendingDown size={18} style={{ color: 'var(--danger)' }} /> Slow movers
            </h2>
          </div>
          <ul className="list-plain">
            {data.slow_movers.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <strong>{p.units_sold} units</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

function PeriodReports() {
  const toast = useToast()
  const monthStart = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [type, setType] = useState('sales_by_product')
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(isoDate())
  const [exporting, setExporting] = useState(false)
  const { data, error, loading, reload } = useAsync(() => adminApi.report({ type, from, to }), [type, from, to])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const q = new URLSearchParams({ type, from, to }).toString()
      await openProtectedFile(`/api/admin/reports/export.csv?${q}`, { download: true, filename: `ubwiwacu-${type}-${from}_${to}.csv` })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setExporting(false)
    }
  }

  const rows = data?.rows || []
  const cols = rows[0] ? Object.keys(rows[0]) : []

  return (
    <div className="panel">
      <div className="toolbar">
        <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Report type">
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="row small" style={{ gap: 6 }}>
          From <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="row small" style={{ gap: 6 }}>
          To <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn btn--dark btn--sm" style={{ marginLeft: 'auto' }} onClick={exportCsv} disabled={exporting}>
          {exporting ? <Spinner /> : <Download size={16} />} Export CSV
        </button>
      </div>
      {data?.summary && (
        <div className="panel-body row" style={{ gap: 28, borderBottom: '1px solid var(--line)' }}>
          {Object.entries(data.summary).map(([k, v]) => (
            <div key={k}>
              <div className="small muted">{humanize(k)}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{cell(k, v)}</div>
            </div>
          ))}
        </div>
      )}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <div className="table-empty">No data for this period.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} className={MONEY.test(c) || typeof rows[0][c] === 'number' ? 'num' : undefined}>
                    {humanize(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className={MONEY.test(c) || typeof r[c] === 'number' ? 'num' : undefined}>
                      {cell(c, r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Reports() {
  const [tab, setTab] = useState('reports')
  return (
    <>
      <PageHead
        title="Reports & analytics"
        subtitle="All revenue figures count verified (paid) payments only."
        actions={
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'reports'} onClick={() => setTab('reports')}>
              Period reports
            </button>
            <button role="tab" aria-selected={tab === 'products'} onClick={() => setTab('products')}>
              Product analytics
            </button>
          </div>
        }
      />
      {tab === 'reports' ? <PeriodReports /> : <ProductAnalytics />}
    </>
  )
}
