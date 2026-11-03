import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  ClipboardList,
  CreditCard,
  Globe,
  Inbox,
  Monitor,
  Package,
  PackagePlus,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'
import { ErrorState, FulfilmentBadge, Loading, PaymentBadge } from '../components/ui.jsx'
import { InstagramIcon, WhatsAppIcon } from '../components/Brand.jsx'
import { canAccess, ROLE_GROUPS } from '../components/ProtectedRoute.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { adminApi } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatNumber, formatRWF, humanize, timeAgo } from '../lib/format.js'

const SOURCE_ICON = { web: Globe, pos: Monitor, whatsapp: WhatsAppIcon, phone: Phone, instagram: InstagramIcon }

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const shortRWF = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

function Kpi({ label, value, sub, icon: Icon, tone = '', to }) {
  const Tag = to ? Link : 'div'
  return (
    <Tag to={to} className={`kpi ${tone ? `kpi--${tone}` : ''}`}>
      <span className="kpi-icon">
        <Icon size={18} />
      </span>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {sub && <span className="kpi-sub">{sub}</span>}
      {to && <ArrowUpRight size={15} className="kpi-go" />}
    </Tag>
  )
}

/** 14-day bar chart — one series at a time (orders or revenue), one axis, hover tooltip per bar. */
function DailyChart({ days }) {
  const [metric, setMetric] = useState('orders')
  const [hover, setHover] = useState(null)
  const values = days.map((d) => (metric === 'orders' ? d.orders : d.revenue_rwf))
  const max = Math.max(1, ...values)
  const total = values.reduce((s, v) => s + v, 0)
  const fmt = (v) => (metric === 'orders' ? formatNumber(v) : formatRWF(v))
  const label = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const gridSteps = [1, 0.5]

  return (
    <div className="panel chart-panel">
      <div className="panel-head">
        <div>
          <h2>Last 14 days</h2>
          <p className="panel-sub">
            {metric === 'orders' ? `${formatNumber(total)} orders placed` : `${formatRWF(total)} verified revenue`}
          </p>
        </div>
        <div className="seg-mini" role="tablist" aria-label="Chart metric">
          <button role="tab" aria-selected={metric === 'orders'} onClick={() => setMetric('orders')}>
            Orders
          </button>
          <button role="tab" aria-selected={metric === 'revenue'} onClick={() => setMetric('revenue')}>
            Revenue
          </button>
        </div>
      </div>
      <div className="chart" onMouseLeave={() => setHover(null)}>
        <div className="chart-grid" aria-hidden="true">
          {gridSteps.map((s) => (
            <span key={s} style={{ bottom: `${s * 100}%` }}>
              <em>{metric === 'orders' ? (Number.isInteger(max * s) ? max * s : '') : shortRWF(Math.round(max * s))}</em>
            </span>
          ))}
        </div>
        <div className="chart-bars" role="img" aria-label={`${metric} per day for the last 14 days`}>
          {days.map((d, i) => {
            const v = values[i]
            const isToday = i === days.length - 1
            return (
              <div key={d.day} className={`chart-col ${hover === i ? 'is-hover' : ''}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
                <span className={`chart-bar ${isToday ? 'is-today' : ''} ${v === 0 ? 'is-zero' : ''}`} style={{ height: `${Math.max(v ? 4 : 1.5, (v / max) * 100)}%` }} />
                {hover === i && (
                  <span className="chart-tip" role="tooltip">
                    <strong>{fmt(v)}</strong>
                    <small>{label(d.day)}</small>
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="chart-x" aria-hidden="true">
          {days.map((d, i) => (
            <span key={d.day}>{i % 2 === 1 || i === days.length - 1 ? (i === days.length - 1 ? 'Today' : label(d.day)) : ''}</span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{metric} per day</caption>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.day}>
              <th>{d.day}</th>
              <td>{fmt(values[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Pipeline({ o }) {
  const rows = [
    { label: 'Awaiting payment', value: o.awaiting_payment, to: '/admin/orders?paymentStatus=pending' },
    { label: 'Awaiting verification', value: o.awaiting_verification, to: '/admin/payments' },
    { label: 'Paid, to prepare', value: o.awaiting_fulfilment, to: '/admin/orders?paymentStatus=paid' },
    { label: 'Completed', value: o.completed, to: '/admin/orders?status=fulfilled' },
    { label: 'Cancelled', value: o.cancelled, to: '/admin/orders?status=cancelled', muted: true },
  ]
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Order pipeline</h2>
          <p className="panel-sub">Where every order is right now</p>
        </div>
        <Link to="/admin/orders" className="link-arrow">
          Orders <ArrowRight size={15} />
        </Link>
      </div>
      <div className="panel-body pipeline">
        {rows.map((r) => (
          <Link key={r.label} to={r.to} className={`pipe-row ${r.muted ? 'pipe-row--muted' : ''}`} title={`${r.label}: ${r.value}`}>
            <span className="pipe-label">{r.label}</span>
            <span className="pipe-track">
              <span className="pipe-fill" style={{ width: r.value ? `${Math.max(4, (r.value / max) * 100)}%` : 0 }} />
            </span>
            <span className="pipe-value">{formatNumber(r.value)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(() => adminApi.dashboard(), [])
  const analytics = useAsync(() => adminApi.productAnalytics(), [])

  if (loading && !data) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const o = data.orders
  const a = analytics.data
  const canPos = canAccess(user?.role, ROLE_GROUPS.POS)
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const firstName = (user?.name || '').split(' ')[0]
  const toVerify = o.awaiting_verification
  const alerts = a?.reorder_alerts || []
  const best = (a?.best_sellers || []).filter((p) => p.units_sold > 0)
  const bestMax = Math.max(1, ...best.map((p) => p.units_sold))
  const sources = data.orders_by_source || []
  const sourceTotal = sources.reduce((s, x) => s + x.orders, 0) || 1

  const attention = [
    toVerify > 0 && `${toVerify} payment${toVerify === 1 ? '' : 's'} to verify`,
    o.awaiting_fulfilment > 0 && `${o.awaiting_fulfilment} paid order${o.awaiting_fulfilment === 1 ? '' : 's'} to prepare`,
    data.out_of_stock_count > 0 && `${data.out_of_stock_count} product${data.out_of_stock_count === 1 ? '' : 's'} sold out`,
  ].filter(Boolean)

  const refresh = () => {
    reload()
    analytics.reload()
  }

  const ACTIONS = [
    { to: '/admin/orders/new', label: 'Manual order', text: 'WhatsApp, phone or Instagram', icon: Plus },
    canPos && { to: '/admin/pos', label: 'Point of sale', text: 'Sell to a walk-in customer', icon: Monitor },
    { to: '/admin/payments', label: 'Verify payments', text: toVerify ? `${toVerify} waiting` : 'Nothing waiting', icon: CreditCard, hot: toVerify > 0 },
    { to: '/admin/products', label: 'Update stock', text: 'Restock or count', icon: Boxes },
    { to: '/admin/products', label: 'Add product', text: 'New package or size', icon: PackagePlus },
    { to: '/admin/customers', label: 'Customers', text: `${formatNumber(data.customers?.total || 0)} people`, icon: Users },
    { to: '/admin/receipts', label: 'Receipts', text: 'Send or print', icon: Receipt },
    { to: '/admin/reports', label: 'Reports', text: 'Sales & exports', icon: BarChart3 },
  ].filter(Boolean)

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="dash-head-text">
          <span className="dash-date">{today}</span>
          <h1>
            {greeting()}
            {firstName ? `, ${firstName}` : ''} <span className="dash-wave">👋</span>
          </h1>
          <p>
            {attention.length ? (
              <>
                Needs attention: <strong>{attention.join(' · ')}</strong>
              </>
            ) : (
              'Everything is up to date. Here is how the shop is doing.'
            )}
          </p>
        </div>
        <div className="dash-head-actions">
          <button className="btn btn--outline btn--sm" onClick={refresh} aria-label="Refresh dashboard">
            <RefreshCw size={15} className={loading || analytics.loading ? 'spin' : ''} /> Refresh
          </button>
          {canPos && (
            <Link to="/admin/pos" className="btn btn--dark btn--sm">
              <Monitor size={15} /> Open POS
            </Link>
          )}
          <Link to="/admin/orders/new" className="btn btn--primary btn--sm">
            <Plus size={15} /> New order
          </Link>
        </div>
        <div className="dash-today">
          <span>Today</span>
          <b>
            <ShoppingBag size={14} /> {formatNumber(o.orders_today)} order{o.orders_today === 1 ? '' : 's'}
          </b>
          <b>
            <Wallet size={14} /> {formatRWF(data.verified_revenue_today_rwf)}
          </b>
          <b className={toVerify ? 'is-hot' : ''}>
            <CreditCard size={14} /> {toVerify} to verify
          </b>
          <b className={data.low_stock_count ? 'is-hot' : ''}>
            <AlertTriangle size={14} /> {data.low_stock_count} stock alert{data.low_stock_count === 1 ? '' : 's'}
          </b>
        </div>
      </header>

      <div className="kpis">
        <Kpi tone="hero" label="Verified revenue" value={formatRWF(data.verified_revenue_rwf)} sub={`This month ${formatRWF(data.verified_revenue_month_rwf)}`} icon={Wallet} to="/admin/reports" />
        <Kpi label="Orders" value={formatNumber(o.total_orders)} sub={`${o.orders_today} today`} icon={ClipboardList} to="/admin/orders" />
        <Kpi tone={toVerify ? 'warn' : ''} label="To verify" value={formatNumber(toVerify)} sub={toVerify ? 'Needs you' : 'All clear'} icon={CreditCard} to="/admin/payments" />
        <Kpi tone="info" label="To prepare" value={formatNumber(o.awaiting_fulfilment)} sub={`${o.completed} completed`} icon={Truck} to="/admin/orders?paymentStatus=paid" />
        <Kpi tone="plum" label="Customers" value={formatNumber(data.customers?.total || 0)} sub={`${data.customers?.new_30d || 0} new in 30 days`} icon={Users} to="/admin/customers" />
        <Kpi label="Units sold" value={formatNumber(a?.totals?.units_sold || 0)} sub={`${formatNumber(a?.totals?.stock_units || 0)} in stock`} icon={Package} to="/admin/products" />
        <Kpi tone={data.low_stock_count ? 'danger' : 'success'} label="Stock alerts" value={formatNumber(data.low_stock_count)} sub={data.out_of_stock_count ? `${data.out_of_stock_count} sold out` : 'Stock healthy'} icon={AlertTriangle} to="/admin/products" />
      </div>

      <div className="dash-row dash-row--chart">
        <DailyChart days={data.daily || []} />
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Quick actions</h2>
              <p className="panel-sub">Jump straight to common jobs</p>
            </div>
          </div>
          <div className="qa-grid">
            {ACTIONS.map(({ to, label, text, icon: Icon, hot }) => (
              <Link key={label} to={to} className={`qa ${hot ? 'qa--hot' : ''}`}>
                <span className="qa-icon">
                  <Icon size={18} />
                </span>
                <strong>{label}</strong>
                <small>{text}</small>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-row dash-row--3">
        <Pipeline o={o} />

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Best sellers</h2>
              <p className="panel-sub">Units sold, all time</p>
            </div>
            <Sparkles size={18} style={{ color: 'var(--honey-600)' }} />
          </div>
          {best.length === 0 ? (
            <div className="panel-body empty-mini">
              <Package size={24} />
              <strong>No sales yet</strong>
              <span>Best sellers appear after the first paid orders.</span>
            </div>
          ) : (
            <ol className="best">
              {best.map((p, i) => (
                <li key={p.id} title={`${p.name}: ${p.units_sold} units · ${formatRWF(p.revenue_rwf)}`}>
                  <span className="best-rank">{i + 1}</span>
                  <span className="best-body">
                    <span className="best-top">
                      <strong>{p.name}</strong>
                      <span>{formatNumber(p.units_sold)}</span>
                    </span>
                    <span className="pipe-track">
                      <span className="pipe-fill" style={{ width: `${(p.units_sold / bestMax) * 100}%` }} />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Sales channels</h2>
              <p className="panel-sub">Where orders come from</p>
            </div>
          </div>
          {sources.length === 0 ? (
            <div className="panel-body empty-mini">
              <Inbox size={24} />
              <strong>No orders yet</strong>
            </div>
          ) : (
            <ul className="channels">
              {sources.map((s) => {
                const Icon = SOURCE_ICON[s.source] || Globe
                const pct = Math.round((s.orders / sourceTotal) * 100)
                return (
                  <li key={s.source}>
                    <span className={`source-tag source-tag--${s.source}`}>
                      <Icon size={13} /> {humanize(s.source)}
                    </span>
                    <span className="pipe-track">
                      <span className="pipe-fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="channels-val">
                      {s.orders} <small>{pct}%</small>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="dash-row dash-row--split">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Recent orders</h2>
              <p className="panel-sub">The latest 10 from every channel</p>
            </div>
            <Link to="/admin/orders" className="link-arrow">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="table-empty">
                      <div className="empty-mini">
                        <Inbox size={26} />
                        <strong>No orders yet</strong>
                      </div>
                    </td>
                  </tr>
                )}
                {data.recent_orders.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => navigate(`/admin/orders/${r.id}`)}>
                    <td>
                      <div className="order-no">{r.order_number}</div>
                      <div className="small muted">
                        {timeAgo(r.created_at)} · {humanize(r.source)}
                      </div>
                    </td>
                    <td>{r.customer_name}</td>
                    <td>
                      <PaymentBadge status={r.payment_status} />
                    </td>
                    <td>
                      <FulfilmentBadge status={r.fulfilment_status} />
                    </td>
                    <td className="num strong">{formatRWF(r.total_rwf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2 className="row" style={{ gap: 8 }}>
              <AlertTriangle size={18} style={{ color: 'var(--warn)' }} /> Stock &amp; restock
            </h2>
            <span className={`badge ${alerts.length ? 'badge--warn' : 'badge--success'}`}>{alerts.length ? `${alerts.length} to restock` : 'Healthy'}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="panel-body empty-mini">
              <Package size={26} />
              <strong>Stock is healthy</strong>
              <span>No product is low or selling out soon.</span>
            </div>
          ) : (
            <ul className="list-plain stock-list">
              {alerts.map((p) => (
                <li key={p.id}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong className="small">{p.name}</strong>
                    <div className="small muted">
                      {p.stock_remaining} left{p.days_until_stockout != null ? ` · ~${p.days_until_stockout} days` : ''}
                    </div>
                  </div>
                  <span className={`badge ${p.stock_remaining === 0 ? 'badge--danger' : 'badge--warn'}`}>{p.stock_remaining === 0 ? 'Sold out' : 'Low'}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="panel-body" style={{ paddingTop: alerts.length ? 0 : undefined }}>
            <Link to="/admin/products" className="btn btn--outline btn--sm btn--block">
              <Boxes size={15} /> Manage stock
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
