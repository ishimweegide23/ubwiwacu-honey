import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, ClipboardList, CreditCard, Globe, Hourglass, Inbox, LayoutGrid, List, Monitor, Phone, Plus, RefreshCw, Search, ShoppingBag, Truck, X } from 'lucide-react'
import { PageHead } from './AdminLayout.jsx'
import { InstagramIcon, WhatsAppIcon } from '../components/Brand.jsx'
import { ErrorState, FulfilmentBadge, Loading, Pager, PaymentBadge, fulfilmentText, paymentText } from '../components/ui.jsx'
import { adminApi } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatDateTime, formatNumber, formatRWF, humanize, timeAgo } from '../lib/format.js'

// Values mirror the backend's constants (src/config/constants.js); the API validates them.
const FULFIL = ['received', 'awaiting_payment', 'payment_verification', 'paid', 'preparing', 'ready', 'fulfilled', 'cancelled', 'refunded']
const PAY = ['pending', 'verification', 'paid', 'rejected', 'refunded']
const SOURCES = ['web', 'pos', 'whatsapp', 'phone', 'instagram']

const SOURCE_ICON = { web: Globe, pos: Monitor, whatsapp: WhatsAppIcon, phone: Phone, instagram: InstagramIcon }

/**
 * Quick tabs. `count` reads the dashboard totals, and only where the total
 * matches the filter exactly (e.g. "awaiting payment" on the dashboard also
 * counts rejected payments, so that tab shows no number).
 */
const TABS = [
  { label: 'All orders', set: {}, count: 'total_orders' },
  { label: 'Awaiting payment', set: { paymentStatus: 'pending' } },
  { label: 'To verify', set: { paymentStatus: 'verification' }, count: 'awaiting_verification', alert: true },
  { label: 'Paid', set: { paymentStatus: 'paid' }, count: 'confirmed' },
  { label: 'Completed', set: { status: 'fulfilled' }, count: 'completed' },
  { label: 'Cancelled', set: { status: 'cancelled' }, count: 'cancelled' },
]
const TAB_KEYS = ['paymentStatus', 'status']
const VIEW_KEY = 'ubh_orders_view'

/** Board columns: where each order sits in its journey. */
const STAGES = [
  { key: 'pay', label: 'Awaiting payment', icon: Hourglass, test: (o) => ['pending', 'rejected'].includes(o.payment_status) && !['cancelled', 'refunded'].includes(o.fulfilment_status) },
  { key: 'verify', label: 'Verifying', icon: CreditCard, test: (o) => o.payment_status === 'verification' },
  { key: 'prepare', label: 'To prepare', icon: ShoppingBag, test: (o) => o.payment_status === 'paid' && ['paid', 'preparing', 'received'].includes(o.fulfilment_status) },
  { key: 'ready', label: 'Ready', icon: Truck, test: (o) => o.fulfilment_status === 'ready' },
  { key: 'done', label: 'Completed', icon: ClipboardList, test: (o) => o.fulfilment_status === 'fulfilled' },
  { key: 'stop', label: 'Cancelled / refunded', icon: X, test: (o) => ['cancelled', 'refunded'].includes(o.fulfilment_status) },
]

function Board({ orders, onOpen }) {
  const cols = STAGES.map((s) => ({ ...s, items: orders.filter(s.test) }))
  return (
    <div className="board">
      {cols.map(({ key, label, icon: Icon, items }) => (
        <section key={key} className={`board-col board-col--${key}`} aria-label={label}>
          <header>
            <span className="board-col-icon">
              <Icon size={15} />
            </span>
            <strong>{label}</strong>
            <span className="board-count">{items.length}</span>
          </header>
          <div className="board-list">
            {items.length === 0 && <p className="board-empty">Nothing here</p>}
            {items.map((o) => (
              <button key={o.id} className="board-card" onClick={() => onOpen(o.id)}>
                <span className="board-card-top">
                  <strong className="order-no">{o.order_number}</strong>
                  <span>{formatRWF(o.total_rwf)}</span>
                </span>
                <span className="board-card-who">{o.customer_name}</span>
                <span className="board-card-meta">
                  <SourceTag source={o.source} />
                  <span>{timeAgo(o.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function SourceTag({ source }) {
  const Icon = SOURCE_ICON[source] || Globe
  return (
    <span className={`source-tag source-tag--${source}`}>
      <Icon size={13} /> {humanize(source)}
    </span>
  )
}

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

export default function Orders() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filters = {
    q: params.get('q') || '',
    status: params.get('status') || '',
    paymentStatus: params.get('paymentStatus') || '',
    source: params.get('source') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
    page: params.get('page') || '1',
  }
  const key = params.toString()
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'list')
  const chooseView = (v) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }
  const { data, meta, error, loading, reload } = useAsync(() => adminApi.orders({ ...filters, limit: view === 'board' ? 100 : 20 }), [key, view])
  const counts = useAsync(() => adminApi.dashboard(), [])
  const totals = counts.data?.orders

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const pickTab = (tab) => {
    const next = new URLSearchParams(params)
    TAB_KEYS.forEach((k) => next.delete(k))
    Object.entries(tab.set).forEach(([k, v]) => next.set(k, v))
    next.delete('page')
    setParams(next, { replace: true })
  }
  const isTab = (tab) => TAB_KEYS.every((k) => (tab.set[k] || '') === filters[k])

  const refresh = () => {
    reload()
    counts.reload()
  }

  const chips = [
    filters.q && { k: 'q', label: `“${filters.q}”` },
    filters.paymentStatus && { k: 'paymentStatus', label: `Payment: ${paymentText(filters.paymentStatus)}` },
    filters.status && { k: 'status', label: `Status: ${fulfilmentText(filters.status)}` },
    filters.source && { k: 'source', label: `Source: ${humanize(filters.source)}` },
    filters.from && { k: 'from', label: `From ${filters.from}` },
    filters.to && { k: 'to', label: `To ${filters.to}` },
  ].filter(Boolean)

  return (
    <>
      <PageHead
        title="Orders"
        subtitle={
          meta ? `${formatNumber(meta.total)} order${meta.total === 1 ? '' : 's'} found · web, POS, WhatsApp, phone and Instagram` : 'Every order from every channel.'
        }
        actions={
          <>
            <button className="btn btn--outline btn--sm" onClick={refresh} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <Link to="/admin/orders/new" className="btn btn--primary btn--sm">
              <Plus size={16} /> Manual order
            </Link>
          </>
        }
      />

      {totals && (
        <div className="mini-stats">
          <div className="mini-stat">
            <span className="mini-stat-icon">
              <ClipboardList size={18} />
            </span>
            <div>
              <strong>{formatNumber(totals.total_orders)}</strong>
              <span>All orders · {totals.orders_today} today</span>
            </div>
          </div>
          <div className="mini-stat">
            <span className="mini-stat-icon mini-stat-icon--warn">
              <Hourglass size={18} />
            </span>
            <div>
              <strong>{formatNumber(totals.awaiting_payment)}</strong>
              <span>Awaiting payment</span>
            </div>
          </div>
          <div className="mini-stat">
            <span className="mini-stat-icon mini-stat-icon--danger">
              <CreditCard size={18} />
            </span>
            <div>
              <strong>{formatNumber(totals.awaiting_verification)}</strong>
              <span>To verify</span>
            </div>
          </div>
          <div className="mini-stat">
            <span className="mini-stat-icon mini-stat-icon--success">
              <Truck size={18} />
            </span>
            <div>
              <strong>{formatNumber(totals.awaiting_fulfilment)}</strong>
              <span>Paid, to prepare</span>
            </div>
          </div>
          <div className="mini-stat">
            <span className="mini-stat-icon">
              <ShoppingBag size={18} />
            </span>
            <div>
              <strong>{formatRWF(counts.data.verified_revenue_month_rwf)}</strong>
              <span>Verified this month</span>
            </div>
          </div>
        </div>
      )}

      <div className="list-bar">
        <div className="seg-tabs" role="tablist" aria-label="Order views" style={{ marginBottom: 0 }}>
          {TABS.map((t) => {
            const n = t.count && totals ? totals[t.count] : null
            return (
              <button key={t.label} role="tab" aria-selected={isTab(t)} onClick={() => pickTab(t)}>
                {t.label}
                {n != null && <span className={`seg-count ${t.alert && n > 0 ? 'seg-count--alert' : ''}`}>{formatNumber(n)}</span>}
              </button>
            )
          })}
        </div>
        <div className="layout-toggle" role="group" aria-label="Layout">
          <button aria-pressed={view === 'list'} onClick={() => chooseView('list')} title="List view" aria-label="List view">
            <List size={16} />
          </button>
          <button aria-pressed={view === 'board'} onClick={() => chooseView('board')} title="Board view" aria-label="Board view">
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {view === 'board' && data && !error && (
        <>
          <p className="small muted" style={{ margin: '0 0 12px' }}>
            Showing the {data.length} most recent order{data.length === 1 ? '' : 's'} that match your filters, grouped by stage.
          </p>
          <Board orders={data} onOpen={(id) => navigate(`/admin/orders/${id}`)} />
        </>
      )}

      <div className={`panel ${loading && data ? 'is-busy' : ''}`} hidden={view === 'board' && data && !error}>
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            set('q', new FormData(e.currentTarget).get('q')?.toString().trim())
          }}
        >
          <div className="search">
            <Search size={16} />
            <input
              name="q"
              className="input"
              defaultValue={filters.q}
              key={filters.q}
              placeholder="Order #, name, phone, email or payment ref"
              title="Press Enter to search"
              aria-label="Search orders"
            />
          </div>
          <select className="select" value={filters.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)} aria-label="Payment status">
            <option value="">Any payment</option>
            {PAY.map((s) => (
              <option key={s} value={s}>
                {paymentText(s)}
              </option>
            ))}
          </select>
          <select className="select" value={filters.status} onChange={(e) => set('status', e.target.value)} aria-label="Fulfilment status">
            <option value="">Any status</option>
            {FULFIL.map((s) => (
              <option key={s} value={s}>
                {fulfilmentText(s)}
              </option>
            ))}
          </select>
          <select className="select" value={filters.source} onChange={(e) => set('source', e.target.value)} aria-label="Source">
            <option value="">Any source</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
          <div className="date-range">
            <input className="input" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
            <span>to</span>
            <input className="input" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
          </div>
        </form>

        {chips.length > 0 && (
          <div className="filter-chips">
            {chips.map((c) => (
              <button key={c.k} className="filter-chip" onClick={() => set(c.k, '')} aria-label={`Remove filter ${c.label}`}>
                {c.label} <X size={13} />
              </button>
            ))}
            <button className="link-btn" onClick={() => setParams({}, { replace: true })}>
              Clear all
            </button>
          </div>
        )}

        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table--orders">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Source</th>
                    <th className="num">Items</th>
                    <th>Payment</th>
                    <th>Fulfilment</th>
                    <th className="num">Total</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={8} className="table-empty">
                        <div className="empty-mini">
                          <Inbox size={28} />
                          <strong>{chips.length || !isTab(TABS[0]) ? 'No orders match these filters' : 'No orders yet'}</strong>
                          <span>
                            {chips.length || !isTab(TABS[0])
                              ? 'Try another tab, or clear the filters.'
                              : 'Orders from the shop, POS and manual entries will appear here.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {data.map((o) => (
                    <tr key={o.id} className="clickable" onClick={() => navigate(`/admin/orders/${o.id}`)}>
                      <td>
                        <Link to={`/admin/orders/${o.id}`} className="order-no" onClick={(e) => e.stopPropagation()}>
                          {o.order_number}
                        </Link>
                        <div className="small muted" title={formatDateTime(o.created_at)}>
                          {timeAgo(o.created_at)}
                        </div>
                      </td>
                      <td>
                        <div className="cust">
                          <span className="cust-avatar" aria-hidden="true">
                            {initials(o.customer_name)}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="strong">{o.customer_name}</div>
                            <div className="small muted">{o.customer_phone}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <SourceTag source={o.source} />
                        <div className="small muted" style={{ marginTop: 4 }}>
                          {humanize(o.fulfilment_type)}
                          {o.delivery_district ? ` · ${o.delivery_district}` : ''}
                        </div>
                      </td>
                      <td className="num">{o.item_count}</td>
                      <td>
                        <PaymentBadge status={o.payment_status} />
                        {o.payment_method && <div className="small muted" style={{ marginTop: 4 }}>{humanize(o.payment_method)}</div>}
                      </td>
                      <td>
                        <FulfilmentBadge status={o.fulfilment_status} />
                      </td>
                      <td className="num">
                        <div className="strong">{formatRWF(o.total_rwf)}</div>
                        {o.balance_rwf > 0 && o.payment_status !== 'pending' && (
                          <div className="small" style={{ color: 'var(--danger)' }}>
                            {formatRWF(o.balance_rwf)} due
                          </div>
                        )}
                      </td>
                      <td className="row-go">
                        <ChevronRight size={18} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={meta} onPage={(p) => set('page', String(p))} />
          </>
        )}
      </div>
    </>
  )
}
