import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Building, CheckCircle2, ExternalLink, FileText, Minus, Plus, Printer, ScanLine, Search, ShoppingCart, Smartphone, Trash2, User, X } from 'lucide-react'
import { PageHead } from './AdminLayout.jsx'
import { ProductMedia } from '../components/ProductCard.jsx'
import { ErrorState, Loading, Modal, Notice, Spinner } from '../components/ui.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { adminApi, openProtectedFile } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatNumber, formatRWF, isValidEmail, isValidPhone } from '../lib/format.js'

const METHODS = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'mtn_momo', label: 'MTN MoMo', icon: Smartphone },
  { value: 'airtel', label: 'Airtel', icon: Smartphone },
  { value: 'bank', label: 'Bank', icon: Building },
]
const QUICK_CASH = [5000, 10000, 20000, 50000]

export default function Pos() {
  const toast = useToast()
  const { data: products, error, loading, reload } = useAsync(() => adminApi.products({ available: true, limit: 100 }), [])
  const [cart, setCart] = useState({})
  const [search, setSearch] = useState('')
  const [size, setSize] = useState('')
  const [method, setMethod] = useState('cash')
  const [ref, setRef] = useState('')
  const [cash, setCash] = useState('')
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' })
  const [showCustomer, setShowCustomer] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const sizes = useMemo(() => [...new Set((products || []).map((p) => p.package_size))], [products])
  const list = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (products || [])
      .filter((p) => (!size || p.package_size === size) && (!s || p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s)))
      .sort((a, b) => a.weight_grams - b.weight_grams)
  }, [products, search, size])

  if (loading && !products) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const byId = new Map(products.map((p) => [p.id, p]))
  const lines = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({ product: byId.get(id), quantity: q }))
    .filter((l) => l.product)
  const total = lines.reduce((s, l) => s + l.product.price_rwf * l.quantity, 0)
  const units = lines.reduce((s, l) => s + l.quantity, 0)
  const cashNum = Number(String(cash).replace(/\D/g, '')) || 0
  const change = cashNum - total

  const setQty = (p, q) => setCart((c) => ({ ...c, [p.id]: Math.max(0, Math.min(p.stock_qty, q)) }))
  const addOne = (p) => setQty(p, (cart[p.id] || 0) + 1)
  const reset = () => {
    setCart({})
    setRef('')
    setCash('')
    setCustomer({ name: '', phone: '', email: '' })
    setMethod('cash')
    setErr('')
  }

  // Enter in the search box adds the exact SKU match, or the first result (barcode scanners send Enter).
  const onSearchKey = (e) => {
    if (e.key !== 'Enter') return
    const s = search.trim().toLowerCase()
    const hit = list.find((p) => (p.sku || '').toLowerCase() === s) || list[0]
    if (hit && hit.stock_qty > (cart[hit.id] || 0)) {
      addOne(hit)
      setSearch('')
    }
  }

  const charge = async () => {
    setErr('')
    if (!lines.length) return setErr('Add products to the sale.')
    if (method !== 'cash' && !ref.trim()) return setErr('Enter the transaction reference for this payment.')
    if (method === 'cash' && cash && change < 0) return setErr('Cash received is less than the total.')
    if (customer.phone && !isValidPhone(customer.phone)) return setErr('Customer phone looks incorrect.')
    if (customer.email && !isValidEmail(customer.email)) return setErr('Customer email looks incorrect.')
    setBusy(true)
    try {
      const res = await adminApi.posSale({
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        payment_method: method,
        transaction_ref: ref.trim() || undefined,
        customer_name: customer.name.trim() || undefined,
        customer_phone: customer.phone.trim() || undefined,
        customer_email: customer.email.trim() || undefined,
      })
      setDone({ ...res.data, change: method === 'cash' && cash ? change : null })
      reset()
      reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title="Point of Sale" subtitle="In-shop sales are paid immediately, reduce stock instantly and issue a receipt." />
      <div className="till">
        <section className="till-products">
          <div className="till-search">
            <ScanLine size={18} />
            <input
              placeholder="Search or scan SKU, then press Enter to add"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              autoFocus
              aria-label="Search products"
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="seg till-sizes" role="group" aria-label="Filter by size">
            <button aria-pressed={!size} onClick={() => setSize('')}>
              All
            </button>
            {sizes.map((s) => (
              <button key={s} aria-pressed={size === s} onClick={() => setSize(size === s ? '' : s)}>
                {s}
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <div className="panel panel-body empty-mini">
              <Search size={24} />
              <strong>No product matches</strong>
            </div>
          ) : (
            <div className="till-grid">
              {list.map((p) => {
                const inCart = cart[p.id] || 0
                const out = p.stock_qty <= 0
                const pct = Math.min(100, (p.stock_qty / Math.max(p.low_stock_at * 4, 1)) * 100)
                return (
                  <button key={p.id} className={`till-item ${inCart ? 'is-in' : ''}`} onClick={() => addOne(p)} disabled={out || inCart >= p.stock_qty}>
                    {inCart > 0 && <span className="till-badge">{inCart}</span>}
                    <span className={`till-img ${p.category === 'premium' ? 'till-img--premium' : ''}`}>
                      <ProductMedia product={p} />
                    </span>
                    <span className="till-name">{p.name}</span>
                    <span className="till-price">{formatRWF(p.price_rwf)}</span>
                    <span className="till-stock">
                      <span className={`mini-bar ${p.is_low_stock ? 'mini-bar--low' : ''}`}>
                        <span style={{ width: `${pct}%` }} />
                      </span>
                      <small>{out ? 'Sold out' : `${p.stock_qty} left`}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <aside className="ticket-pos">
          <header className="tp-head">
            <span>
              <ShoppingCart size={18} /> Current sale
            </span>
            <span className="tp-count">{units} item{units === 1 ? '' : 's'}</span>
            {lines.length > 0 && (
              <button onClick={reset} aria-label="Clear sale" title="Clear sale">
                <Trash2 size={16} />
              </button>
            )}
          </header>

          {lines.length === 0 ? (
            <div className="tp-empty">
              <ShoppingCart size={30} />
              <strong>No items yet</strong>
              <span>Tap a product, or scan its SKU.</span>
            </div>
          ) : (
            <ul className="tp-lines">
              {lines.map(({ product: p, quantity }) => (
                <li key={p.id}>
                  <span className="tp-thumb">
                    <ProductMedia product={p} />
                  </span>
                  <div className="tp-line-info">
                    <strong>{p.name}</strong>
                    <small>{formatRWF(p.price_rwf)} each</small>
                    <div className="tp-qty">
                      <button onClick={() => setQty(p, quantity - 1)} aria-label={`One less ${p.name}`}>
                        <Minus size={14} />
                      </button>
                      <span>{quantity}</span>
                      <button onClick={() => setQty(p, quantity + 1)} disabled={quantity >= p.stock_qty} aria-label={`One more ${p.name}`}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <strong className="tp-line-total">{formatRWF(p.price_rwf * quantity)}</strong>
                </li>
              ))}
            </ul>
          )}

          <div className="tp-foot">
            <div className="tp-total">
              <span>Total</span>
              <strong>{formatRWF(total)}</strong>
            </div>

            <div className="tp-methods" role="radiogroup" aria-label="Payment method">
              {METHODS.map(({ value, label, icon: Icon }) => (
                <label key={value} className={`tp-method tp-method--${value} ${method === value ? 'is-on' : ''}`}>
                  <input type="radio" name="pos-method" checked={method === value} onChange={() => setMethod(value)} />
                  <Icon size={17} />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {method === 'cash' ? (
              <div className="tp-cash">
                <label>
                  <span>Cash received</span>
                  <input inputMode="numeric" placeholder="0" value={cash ? formatNumber(cashNum) : ''} onChange={(e) => setCash(e.target.value)} />
                </label>
                <div className="tp-quick">
                  <button type="button" onClick={() => setCash(String(total))} disabled={!total}>
                    Exact
                  </button>
                  {QUICK_CASH.filter((v) => v >= total).slice(0, 3).map((v) => (
                    <button key={v} type="button" onClick={() => setCash(String(v))}>
                      {formatNumber(v)}
                    </button>
                  ))}
                </div>
                {cash && (
                  <div className={`tp-change ${change < 0 ? 'is-short' : ''}`}>
                    <span>{change < 0 ? 'Still due' : 'Change to give'}</span>
                    <strong>{formatRWF(Math.abs(change))}</strong>
                  </div>
                )}
              </div>
            ) : (
              <label className="tp-ref">
                <span>Transaction reference *</span>
                <input className="input mono" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="From the customer’s confirmation SMS" />
              </label>
            )}

            <button type="button" className="tp-customer-toggle" onClick={() => setShowCustomer((v) => !v)} aria-expanded={showCustomer}>
              <User size={15} /> {showCustomer ? 'Hide customer details' : 'Add customer (optional, for the receipt)'}
            </button>
            {showCustomer && (
              <div className="tp-customer">
                <input className="input" placeholder="Name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} aria-label="Customer name" />
                <input className="input" placeholder="Phone" type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} aria-label="Customer phone" />
                <input className="input" placeholder="Email (to send the receipt)" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} aria-label="Customer email" />
              </div>
            )}

            {err && <Notice variant="danger">{err}</Notice>}
            <button className="btn btn--primary btn--lg btn--block tp-charge" onClick={charge} disabled={busy || !lines.length}>
              {busy ? <Spinner /> : <CheckCircle2 size={19} />} Complete sale · {formatRWF(total)}
            </button>
          </div>
        </aside>
      </div>

      {done && (
        <Modal
          title="Sale completed"
          onClose={() => setDone(null)}
          footer={
            <>
              <Link to={`/admin/orders/${done.order.id}`} className="btn btn--outline">
                View order
              </Link>
              <button className="btn btn--primary" onClick={() => setDone(null)}>
                New sale
              </button>
            </>
          }
        >
          <div className="sale-done">
            <span className="sale-done-check">
              <CheckCircle2 size={34} />
            </span>
            <span className="muted">Receipt</span>
            <strong className="sale-done-no">{done.receipt.receipt_number}</strong>
            <span className="muted">
              Order {done.order.order_number} · {formatRWF(done.order.total_rwf)}
            </span>
            {done.change != null && done.change > 0 && (
              <div className="tp-change" style={{ width: '100%' }}>
                <span>Change to give</span>
                <strong>{formatRWF(done.change)}</strong>
              </div>
            )}
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn btn--dark" onClick={() => openProtectedFile(done.receipt.html_url).catch((e) => toast.error(e.message))}>
                <Printer size={17} /> Print receipt
              </button>
              <button className="btn btn--outline" onClick={() => openProtectedFile(done.receipt.pdf_url).catch((e) => toast.error(e.message))}>
                <ExternalLink size={17} /> PDF
              </button>
              <Link className="btn btn--outline" to={`/admin/orders/${done.order.id}/invoice`}>
                <FileText size={17} /> Invoice
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
