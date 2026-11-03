import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Inbox, Mail, MapPin, Package, Phone, Search, ShoppingBag, Users, X } from 'lucide-react'
import { PageHead } from './AdminLayout.jsx'
import { WhatsAppIcon } from '../components/Brand.jsx'
import { ErrorState, FulfilmentBadge, Loading, Pager, PaymentBadge, Spinner } from '../components/ui.jsx'
import { adminApi } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatDateTime, formatNumber, formatRWF, humanize, timeAgo } from '../lib/format.js'

const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'spend', label: 'Top spenders' },
  { value: 'orders', label: 'Most orders' },
]

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

const waNumber = (phone = '') => {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('0') ? `250${digits.slice(1)}` : digits
}

/** Side panel with everything we know about one customer. */
function CustomerPanel({ id, onClose }) {
  const { data: c, error, loading, reload } = useAsync(() => adminApi.customer(id), [id])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer cust-panel" aria-label="Customer details">
        <div className="drawer-head">
          <h2>Customer</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          {loading && !c ? (
            <Loading />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : (
            <>
              <div className="cust-hero">
                <span className="cust-avatar cust-avatar--lg">{initials(c.name)}</span>
                <div>
                  <h3>{c.name}</h3>
                  <span className="small muted">Customer since {formatDateTime(c.first_order_at || c.created_at)}</span>
                </div>
              </div>
              <div className="cust-contact">
                <a href={`tel:${c.phone}`}>
                  <Phone size={15} /> {c.phone}
                </a>
                <a href={`https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(`Hello ${c.name}, this is Ubw'iwacu Honey.`)}`} target="_blank" rel="noreferrer">
                  <WhatsAppIcon size={15} /> WhatsApp
                </a>
                {c.email && (
                  <a href={`mailto:${c.email}`}>
                    <Mail size={15} /> {c.email}
                  </a>
                )}
              </div>
              <div className="cust-kpis">
                <div>
                  <strong>{formatNumber(c.order_count)}</strong>
                  <span>Orders</span>
                </div>
                <div>
                  <strong>{formatRWF(c.total_spent_rwf)}</strong>
                  <span>Paid total</span>
                </div>
                <div>
                  <strong>{formatNumber(c.units_bought)}</strong>
                  <span>Units bought</span>
                </div>
              </div>

              {c.favourites.length > 0 && (
                <>
                  <h4 className="cust-h">Buys most</h4>
                  <ul className="cust-favs">
                    {c.favourites.map((f) => (
                      <li key={f.product_name + f.package_size}>
                        <Package size={14} /> {f.product_name}
                        <b>× {f.units}</b>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h4 className="cust-h">Orders ({c.orders.length})</h4>
              <ul className="cust-orders">
                {c.orders.map((o) => (
                  <li key={o.id}>
                    <div className="cust-order-top">
                      <Link to={`/admin/orders/${o.id}`} className="order-no">
                        {o.order_number}
                      </Link>
                      <strong>{formatRWF(o.total_rwf)}</strong>
                    </div>
                    <div className="small muted">
                      {formatDateTime(o.created_at)} · {humanize(o.source)}
                    </div>
                    <div className="row" style={{ gap: 6, margin: '6px 0' }}>
                      <PaymentBadge status={o.payment_status} />
                      <FulfilmentBadge status={o.fulfilment_status} />
                    </div>
                    {o.items && (
                      <div className="small">
                        {o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
                      </div>
                    )}
                    {o.fulfilment_type === 'delivery' ? (
                      <div className="cust-addr">
                        <MapPin size={14} />
                        <span>
                          {[o.delivery_village, o.delivery_cell, o.delivery_sector, o.delivery_district, o.delivery_province].filter(Boolean).join(', ')}
                          {o.delivery_address && <> · {o.delivery_address}</>}
                          {o.delivery_landmark && <em> — {o.delivery_landmark}</em>}
                          {o.delivery_recipient_name && (
                            <small>
                              To {o.delivery_recipient_name} · {o.delivery_phone}
                            </small>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="cust-addr">
                        <ShoppingBag size={14} /> Collection
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
    </>
  )
}

export default function Customers() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const sort = params.get('sort') || 'recent'
  const page = params.get('page') || '1'
  const open = params.get('id')
  const [search, setSearch] = useState(q)
  const { data, meta, error, loading, reload } = useAsync(() => adminApi.customers({ q, sort, page, limit: 20 }), [q, sort, page])

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page' && k !== 'id') next.delete('page')
    setParams(next, { replace: true })
  }

  // Search as you type (after a short pause).
  useEffect(() => {
    if (search.trim() === q) return undefined
    const t = setTimeout(() => {
      const next = new URLSearchParams(window.location.search)
      if (search.trim()) next.set('q', search.trim())
      else next.delete('q')
      next.delete('page')
      setParams(next, { replace: true })
    }, 350)
    return () => clearTimeout(t)
  }, [search, q, setParams])

  return (
    <>
      <PageHead title="Customers" subtitle={meta ? `${formatNumber(meta.total)} ${meta.total === 1 ? 'person has' : 'people have'} ordered from you. Click one to see everything they bought and where it went.` : 'Everyone who has ordered.'} />

      <div className="list-bar">
        <div className="seg-tabs" role="tablist" aria-label="Sort customers">
          {SORTS.map((s) => (
            <button key={s.value} role="tab" aria-selected={sort === s.value} onClick={() => set('sort', s.value === 'recent' ? '' : s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="list-bar-right">
          <div className="search-pill">
            {loading && data ? <Spinner size={16} /> : <Search size={16} />}
            <input placeholder="Name, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" />
          </div>
        </div>
      </div>

      <div className={`panel ${loading && data ? 'is-busy' : ''}`}>
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
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Last delivery place</th>
                    <th className="num">Orders</th>
                    <th className="num">Paid total</th>
                    <th>Last order</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={6} className="table-empty">
                        <div className="empty-mini">
                          {q ? <Inbox size={28} /> : <Users size={28} />}
                          <strong>{q ? 'No customer matches' : 'No customers yet'}</strong>
                          <span>{q ? 'Try a different name or phone number.' : 'Customers appear here after their first order.'}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {data.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => set('id', c.id)}>
                      <td>
                        <div className="cust">
                          <span className="cust-avatar">{initials(c.name)}</span>
                          <div>
                            <div className="strong">{c.name}</div>
                            <div className="small muted">{formatNumber(c.units_bought)} units bought</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div>{c.phone}</div>
                        <div className="small muted">{c.email || '—'}</div>
                      </td>
                      <td className="small">{c.last_location || <span className="muted">Collection only</span>}</td>
                      <td className="num">{c.order_count}</td>
                      <td className="num strong">{formatRWF(c.total_spent_rwf)}</td>
                      <td className="small muted">{c.last_order_at ? timeAgo(c.last_order_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={meta} onPage={(p) => set('page', String(p))} />
          </>
        )}
      </div>

      {open && <CustomerPanel id={open} onClose={() => set('id', '')} />}
    </>
  )
}
