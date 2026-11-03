import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutGrid,
  List,
  Package,
  PackageX,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  X,
} from 'lucide-react'
import { PageHead } from './AdminLayout.jsx'
import { ProductMedia } from '../components/ProductCard.jsx'
import { ErrorState, Field, Loading, Modal, Notice, Spinner } from '../components/ui.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { adminApi } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'
import { formatDateTime, formatNumber, formatRWF } from '../lib/format.js'

const BLANK = {
  name: '',
  sku: '',
  weight_grams: '',
  category: 'standard',
  price_rwf: '',
  stock_qty: '0',
  low_stock_at: '10',
  short_description: '',
  marketing_story: '',
  suggested_uses: '',
  is_available: true,
  is_featured: false,
  price_change_reason: '',
}

/** Filter tabs → query params understood by GET /api/admin/products. */
const VIEWS = [
  { key: 'all', label: 'All products', params: {} },
  { key: 'live', label: 'In the shop', params: { available: true } },
  { key: 'low', label: 'Low stock', params: { lowStock: true } },
  { key: 'hidden', label: 'Hidden', params: { available: false } },
]

/** Client-side sort of the loaded list. */
const SORTS = [
  { key: 'size', label: 'Size: small to large', fn: (a, b) => a.weight_grams - b.weight_grams || a.price_rwf - b.price_rwf },
  { key: 'name', label: 'Name A–Z', fn: (a, b) => a.name.localeCompare(b.name) },
  { key: 'price-asc', label: 'Price: low to high', fn: (a, b) => a.price_rwf - b.price_rwf },
  { key: 'price-desc', label: 'Price: high to low', fn: (a, b) => b.price_rwf - a.price_rwf },
  { key: 'stock-asc', label: 'Stock: lowest first', fn: (a, b) => a.stock_qty - b.stock_qty },
  { key: 'stock-desc', label: 'Stock: highest first', fn: (a, b) => b.stock_qty - a.stock_qty },
]
const LAYOUT_KEY = 'ubh_products_layout'

/** Compact table row: same data and actions as the card. */
function ProductRow({ p, stats, uploading, onStock, onEdit, onPhoto, onToggle }) {
  const s = stockState(p)
  const premium = p.category === 'premium'
  return (
    <tr className={p.is_available ? '' : 'row-hidden'}>
      <td>
        <div className="prow-name">
          <span className="prow-thumb">
            <ProductMedia product={p} />
          </span>
          <div style={{ minWidth: 0 }}>
            <strong>{p.name}</strong>
            <div className="small muted">
              {p.sku || 'No SKU'} · {p.package_size}
            </div>
          </div>
        </div>
      </td>
      <td>
        {premium ? (
          <span className="badge badge--premium">
            <Sparkles size={11} /> Premium
          </span>
        ) : (
          <span className="badge badge--muted">Standard</span>
        )}
      </td>
      <td className="num strong">{formatRWF(p.price_rwf)}</td>
      <td>
        <div className="prow-stock">
          <strong>{formatNumber(p.stock_qty)}</strong>
          <span className={`stock-pill stock-pill--${s.cls}`}>{s.text}</span>
        </div>
      </td>
      <td className="small">
        {stats ? (
          <>
            {formatNumber(stats.units_sold)} sold · {stats.days_until_stockout == null ? '—' : `${stats.days_until_stockout} d left`}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="num">
        <div className="prow-actions">
          <button className="btn btn--primary btn--sm" onClick={() => onStock(p)}>
            <Boxes size={14} /> Stock
          </button>
          <button className="btn btn--ghost btn--icon" onClick={() => onEdit(p)} title="Edit" aria-label={`Edit ${p.name}`}>
            <Pencil size={16} />
          </button>
          <button className="btn btn--ghost btn--icon" onClick={() => onPhoto(p)} title="Change photo" aria-label={`Change photo of ${p.name}`}>
            {uploading ? <Spinner size={16} /> : <ImagePlus size={16} />}
          </button>
          <button
            className="btn btn--ghost btn--icon"
            onClick={() => onToggle(p, 'is_featured')}
            title={p.is_featured ? 'Remove from featured' : 'Feature on home page'}
            aria-pressed={p.is_featured}
            style={{ color: p.is_featured ? 'var(--honey-600)' : undefined }}
          >
            <Star size={16} fill={p.is_featured ? 'currentColor' : 'none'} />
          </button>
          <button className="btn btn--ghost btn--icon" onClick={() => onToggle(p, 'is_available')} title={p.is_available ? 'Hide from shop' : 'Show in shop'}>
            {p.is_available ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>
      </td>
    </tr>
  )
}

function Switch({ checked, onChange, label, hint }) {
  return (
    <label className="switch-row">
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span aria-hidden="true" />
      </span>
    </label>
  )
}

function ProductForm({ product, onClose, onSaved }) {
  const toast = useToast()
  const isNew = !product
  const [form, setForm] = useState(() =>
    isNew
      ? BLANK
      : {
          ...BLANK,
          ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, product[k] ?? BLANK[k]])),
          weight_grams: String(product.weight_grams),
          price_rwf: String(product.price_rwf),
          low_stock_at: String(product.low_stock_at),
          price_change_reason: '',
        },
  )
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const priceChanged = !isNew && Number(form.price_rwf) !== product.price_rwf

  const save = async () => {
    const er = {}
    if (!form.name.trim()) er.name = 'Required'
    if (!(Number(form.weight_grams) > 0)) er.weight_grams = 'Must be more than 0'
    if (!(Number(form.price_rwf) > 0)) er.price_rwf = 'Must be more than 0'
    if (Number(form.low_stock_at) < 0) er.low_stock_at = 'Must be 0 or more'
    setErrors(er)
    if (Object.keys(er).length) return

    const body = {
      name: form.name.trim(),
      sku: form.sku?.trim() || null,
      weight_grams: Number(form.weight_grams),
      category: form.category,
      price_rwf: Number(form.price_rwf),
      low_stock_at: Number(form.low_stock_at),
      short_description: form.short_description || null,
      marketing_story: form.marketing_story || null,
      suggested_uses: form.suggested_uses || null,
      is_available: form.is_available,
      is_featured: form.is_featured,
    }
    if (isNew) body.stock_qty = Number(form.stock_qty) || 0
    if (priceChanged && form.price_change_reason) body.price_change_reason = form.price_change_reason

    setBusy(true)
    try {
      const res = isNew ? await adminApi.createProduct(body) : await adminApi.updateProduct(product.id, body)
      toast.success(isNew ? 'Product created.' : 'Product updated.')
      onSaved(res.data)
    } catch (err) {
      setErrors({ ...err.fieldErrors, form: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isNew ? 'New product' : `Edit ${product.name}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button className="btn btn--outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={busy}>
            {busy && <Spinner />} {isNew ? 'Create product' : 'Save changes'}
          </button>
        </>
      }
    >
      {errors.form && (
        <div style={{ marginBottom: 16 }}>
          <Notice variant="danger">{errors.form}</Notice>
        </div>
      )}

      <section className="form-section">
        <h3>Basics</h3>
        <div className="form-grid">
          <Field label="Product name" required error={errors.name} className="full">
            {(p) => <input {...p} className="input" value={form.name} onChange={set('name')} placeholder="e.g. Ubw'iwacu Honey - 1 kg" />}
          </Field>
          <Field label="SKU" error={errors.sku}>
            {(p) => <input {...p} className="input" value={form.sku || ''} onChange={set('sku')} placeholder="e.g. UBH-1KG" />}
          </Field>
          <Field label="Category" required>
            {(p) => (
              <select {...p} className="select" value={form.category} onChange={set('category')}>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            )}
          </Field>
          <Field label="Weight (grams)" required error={errors.weight_grams} hint="1 kg = 1000 g. Sets the package size shown to customers.">
            {(p) => <input {...p} className="input" type="number" min="1" value={form.weight_grams} onChange={set('weight_grams')} />}
          </Field>
        </div>
      </section>

      <section className="form-section">
        <h3>Price &amp; stock</h3>
        <div className="form-grid">
          <Field
            label="Price (RWF)"
            required
            error={errors.price_rwf}
            hint={priceChanged ? `Was ${formatRWF(product.price_rwf)}. Old orders and receipts keep their original price.` : undefined}
          >
            {(p) => <input {...p} className="input" type="number" min="1" value={form.price_rwf} onChange={set('price_rwf')} />}
          </Field>
          <Field label="Low-stock alert at" error={errors.low_stock_at} hint="You are warned when stock reaches this number.">
            {(p) => <input {...p} className="input" type="number" min="0" value={form.low_stock_at} onChange={set('low_stock_at')} />}
          </Field>
          {priceChanged && (
            <Field label="Reason for price change" className="full">
              {(p) => <input {...p} className="input" value={form.price_change_reason} onChange={set('price_change_reason')} placeholder="e.g. Approved by management on …" />}
            </Field>
          )}
          {isNew && (
            <Field label="Opening stock" hint="Recorded as a stock adjustment.">
              {(p) => <input {...p} className="input" type="number" min="0" value={form.stock_qty} onChange={set('stock_qty')} />}
            </Field>
          )}
        </div>
      </section>

      <section className="form-section">
        <h3>Shop page text</h3>
        <div className="form-grid">
          <Field label="Short description" className="full" hint="Shown on product cards.">
            {(p) => <textarea {...p} className="textarea" style={{ minHeight: 70 }} value={form.short_description || ''} onChange={set('short_description')} />}
          </Field>
          <Field label="Marketing story" className="full">
            {(p) => <textarea {...p} className="textarea" value={form.marketing_story || ''} onChange={set('marketing_story')} />}
          </Field>
          <Field label="Suggested uses" className="full" hint="Separate with full stops, e.g. Breakfast. Tea. Gifts.">
            {(p) => <input {...p} className="input" value={form.suggested_uses || ''} onChange={set('suggested_uses')} />}
          </Field>
        </div>
      </section>

      <section className="form-section">
        <h3>Visibility</h3>
        <div className="switch-list">
          <Switch checked={form.is_available} onChange={set('is_available')} label="Available in the shop" hint="Customers can see and order it." />
          <Switch checked={form.is_featured} onChange={set('is_featured')} label="Featured on the home page" hint="Shown in “Our Featured Honey”." />
        </div>
      </section>

      {!isNew && product.price_history?.length > 0 && (
        <section className="form-section">
          <h3>Price history</h3>
          <ul className="history">
            {[...product.price_history].reverse().map((h, i) => (
              <li key={i}>
                <span className="dot" />
                <span>
                  <strong>{formatRWF(h.price_rwf)}</strong>
                  {h.previous_price_rwf != null && <span className="muted"> (was {formatRWF(h.previous_price_rwf)})</span>}
                  <br />
                  <span className="small muted">
                    {formatDateTime(h.changed_at)}
                    {h.reason ? ` · ${h.reason}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  )
}

function StockForm({ product, suggested = 0, onClose, onSaved }) {
  const toast = useToast()
  const [mode, setMode] = useState('adjust')
  const [value, setValue] = useState(suggested > 0 ? String(suggested) : '')
  const [reason, setReason] = useState(suggested > 0 ? 'Restock delivery' : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(value)
  const after = mode === 'adjust' ? product.stock_qty + (Number.isInteger(n) ? n : 0) : Number.isInteger(n) && value !== '' ? n : product.stock_qty

  const save = async () => {
    if (value === '' || !Number.isInteger(n) || (mode === 'adjust' && n === 0) || (mode === 'set' && n < 0)) {
      setError(mode === 'adjust' ? 'Enter a whole number such as 20 or -3' : 'Enter the counted stock (0 or more)')
      return
    }
    if (after < 0) return setError('Stock cannot go below zero')
    if (!reason.trim()) return setError('Give a reason, e.g. “Restock delivery” or “Damaged”')
    setBusy(true)
    try {
      const body = mode === 'adjust' ? { adjustment: n, reason } : { quantity: n, reason }
      const res = await adminApi.adjustStock(product.id, body)
      toast.success(`Stock updated: ${res.data.stock_change.before} → ${res.data.stock_change.after}`)
      onSaved(res.data.product)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (m) => {
    setMode(m)
    setValue('')
    setError('')
  }

  return (
    <Modal
      title="Update stock"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={busy}>
            {busy && <Spinner />} Save stock
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="stock-head">
          <span className="stock-thumb">
            <ProductMedia product={product} />
          </span>
          <div>
            <strong>{product.name}</strong>
            <div className="small muted">
              {product.sku || '—'} · alert at {product.low_stock_at}
            </div>
          </div>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'adjust'} onClick={() => switchMode('adjust')}>
            Add / remove
          </button>
          <button role="tab" aria-selected={mode === 'set'} onClick={() => switchMode('set')}>
            Set counted stock
          </button>
        </div>
        <div className="stock-compare">
          <div>
            <span>Now</span>
            <strong>{product.stock_qty}</strong>
          </div>
          <span className="stock-arrow">→</span>
          <div className={after < 0 ? 'is-bad' : after !== product.stock_qty ? 'is-good' : ''}>
            <span>After</span>
            <strong>{after}</strong>
          </div>
        </div>
        <Field label={mode === 'adjust' ? 'Change (use minus to remove)' : 'Counted quantity'} required>
          {(p) => (
            <input
              {...p}
              className="input"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === 'adjust' ? 'e.g. 24 or -2' : 'e.g. 57'}
              autoFocus
            />
          )}
        </Field>
        {mode === 'adjust' && (
          <div className="quick-qty" aria-label="Quick amounts">
            {[6, 12, 24, 48].map((q) => (
              <button key={q} type="button" className="chip" onClick={() => setValue(String((Number.isInteger(n) ? n : 0) + q))}>
                +{q}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => setValue(String((Number.isInteger(n) ? n : 0) - 1))}>
              −1
            </button>
          </div>
        )}
        <Field label="Reason" required hint="Saved in the audit log.">
          {(p) => <input {...p} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Restock delivery, damaged jar, stock count…" />}
        </Field>
        <div className="quick-qty">
          {['Restock delivery', 'Stock count', 'Damaged / broken'].map((r) => (
            <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        {error && <Notice variant="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

function stockState(p) {
  if (p.stock_qty === 0) return { cls: 'out', text: 'Out of stock' }
  if (p.is_low_stock) return { cls: 'low', text: `Low · alert at ${p.low_stock_at}` }
  return { cls: 'ok', text: 'In stock' }
}

function ProductTile({ p, stats, uploading, onStock, onEdit, onPhoto, onToggle }) {
  const s = stockState(p)
  const pct = Math.min(100, (p.stock_qty / Math.max(p.low_stock_at * 4, 1)) * 100)
  const premium = p.category === 'premium'
  return (
    <article className={`ptile ${p.is_available ? '' : 'ptile--hidden'}`}>
      <div className={`ptile-media ${premium ? 'ptile-media--premium' : ''}`}>
        <ProductMedia product={p} />
        <div className="ptile-tags">
          {premium ? (
            <span className="badge badge--premium">
              <Sparkles size={12} /> Premium
            </span>
          ) : (
            <span className="badge badge--glass">{p.package_size}</span>
          )}
          {!p.is_available && (
            <span className="badge badge--muted">
              <EyeOff size={12} /> Hidden
            </span>
          )}
        </div>
        <button
          className={`ptile-star ${p.is_featured ? 'is-on' : ''}`}
          onClick={() => onToggle(p, 'is_featured')}
          title={p.is_featured ? 'Remove from featured' : 'Feature on the home page'}
          aria-label={p.is_featured ? `Remove ${p.name} from featured` : `Feature ${p.name}`}
          aria-pressed={p.is_featured}
        >
          <Star size={16} fill={p.is_featured ? 'currentColor' : 'none'} />
        </button>
        <button className="ptile-photo" onClick={() => onPhoto(p)} aria-label={`Upload photo for ${p.name}`}>
          {uploading ? <Spinner /> : <ImagePlus size={16} />} {uploading ? 'Uploading…' : 'Change photo'}
        </button>
      </div>

      <div className="ptile-body">
        <div className="ptile-title">
          <h3>{p.name}</h3>
          <span className="small muted">
            {p.sku || 'No SKU'} · {p.package_size}
          </span>
        </div>
        <div className="ptile-price">{formatRWF(p.price_rwf)}</div>

        <div className="ptile-stock">
          <div className="ptile-stock-top">
            <span>
              <strong>{formatNumber(p.stock_qty)}</strong> in stock
            </span>
            <span className={`stock-pill stock-pill--${s.cls}`}>{s.text}</span>
          </div>
          <div className={`mini-bar ${s.cls !== 'ok' ? 'mini-bar--low' : ''}`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>

        {stats && (
          <dl className="ptile-stats">
            <div>
              <dt>Sold</dt>
              <dd>{formatNumber(stats.units_sold)}</dd>
            </div>
            <div>
              <dt>Last 30 days</dt>
              <dd>{formatNumber(stats.units_last_30d)}</dd>
            </div>
            <div>
              <dt>Runs out in</dt>
              <dd>{stats.days_until_stockout == null ? '—' : `${stats.days_until_stockout} d`}</dd>
            </div>
          </dl>
        )}

        <div className="ptile-actions">
          <button className="btn btn--primary btn--sm" onClick={() => onStock(p)}>
            <Boxes size={15} /> Stock
          </button>
          <button className="btn btn--outline btn--sm" onClick={() => onEdit(p)}>
            <Pencil size={15} /> Edit
          </button>
          <button
            className="btn btn--ghost btn--icon"
            onClick={() => onToggle(p, 'is_available')}
            title={p.is_available ? 'Hide from shop' : 'Show in shop'}
            aria-label={p.is_available ? `Hide ${p.name} from shop` : `Show ${p.name} in shop`}
          >
            {p.is_available ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function Products() {
  const toast = useToast()
  // ?q= comes from global search ("open this product").
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '')
  const [q, setQ] = useState(search)
  const [category, setCategory] = useState('')
  const [view, setView] = useState('all')
  const [sortKey, setSortKey] = useState('size')
  const [layout, setLayout] = useState(() => localStorage.getItem(LAYOUT_KEY) || 'grid')
  const chooseLayout = (l) => {
    setLayout(l)
    localStorage.setItem(LAYOUT_KEY, l)
  }
  const [editing, setEditing] = useState(null) // product | 'new'
  const [stocking, setStocking] = useState(null)
  const [suggestQty, setSuggestQty] = useState(0)
  const [uploadingId, setUploadingId] = useState(null)
  const fileRef = useRef(null)
  const uploadTarget = useRef(null)

  // Wait until typing pauses before asking the API.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const viewParams = VIEWS.find((v) => v.key === view).params
  const { data, error, loading, reload } = useAsync(
    () => adminApi.products({ q, category, ...viewParams, limit: 100 }),
    [q, category, view],
  )
  // Sales + totals for every product (independent of the filters above).
  const analytics = useAsync(() => adminApi.productAnalytics(), [])
  const all = analytics.data?.products || []
  const statsById = Object.fromEntries(all.map((p) => [p.id, p]))
  const summary = {
    total: all.length,
    live: all.filter((p) => p.is_available).length,
    low: all.filter((p) => p.is_available && p.is_low_stock && p.stock_remaining > 0).length,
    out: all.filter((p) => p.is_available && p.stock_remaining === 0).length,
    sold: analytics.data?.totals?.units_sold ?? 0,
  }

  // Products that need restocking (low stock, or selling fast enough to run out soon).
  const alerts = analytics.data?.reorder_alerts || []
  const suggestFor = (a) => Math.max(a.suggested_reorder_qty || 0, a.low_stock_at * 3 - a.stock_remaining, 1)
  const productFor = (a) =>
    (data || []).find((p) => p.id === a.id) || {
      id: a.id,
      name: a.name,
      sku: a.sku,
      slug: a.slug,
      category: a.category,
      package_size: a.package_size,
      stock_qty: a.stock_remaining,
      low_stock_at: a.low_stock_at,
    }

  const refreshAll = () => {
    reload()
    analytics.reload()
  }

  const toggle = async (p, key) => {
    try {
      if (key === 'is_available' && p.is_available) await adminApi.deleteProduct(p.id)
      else await adminApi.updateProduct(p.id, { [key]: !p[key] })
      toast.success(
        key === 'is_featured'
          ? p.is_featured
            ? `${p.name} removed from featured.`
            : `${p.name} is now featured.`
          : p.is_available
            ? `${p.name} is hidden from the shop.`
            : `${p.name} is back in the shop.`,
      )
      refreshAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const pickImage = (p) => {
    uploadTarget.current = p
    fileRef.current.value = ''
    fileRef.current.click()
  }
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    const p = uploadTarget.current
    if (!file || !p) return
    if (file.size > 5 * 1024 * 1024) return toast.error('Image is larger than 5 MB.')
    setUploadingId(p.id)
    try {
      await adminApi.uploadImage(p.id, file)
      toast.success('Photo uploaded.')
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploadingId(null)
    }
  }

  const products = useMemo(() => {
    const fn = SORTS.find((s) => s.key === sortKey)?.fn
    return fn ? [...(data || [])].sort(fn) : data || []
  }, [data, sortKey])
  const filtered = Boolean(q || category || view !== 'all')

  return (
    <>
      <PageHead
        title="Products & stock"
        subtitle="Prices, stock levels, photos and what customers see in the shop."
        actions={
          <>
            <button className="btn btn--outline btn--sm" onClick={refreshAll} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>
              <Plus size={16} /> New product
            </button>
          </>
        }
      />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />

      <div className="mini-stats">
        <div className="mini-stat">
          <span className="mini-stat-icon">
            <Package size={18} />
          </span>
          <div>
            <strong>{summary.total}</strong>
            <span>Products</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-icon mini-stat-icon--success">
            <Store size={18} />
          </span>
          <div>
            <strong>{summary.live}</strong>
            <span>In the shop</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-icon mini-stat-icon--warn">
            <AlertTriangle size={18} />
          </span>
          <div>
            <strong>{summary.low}</strong>
            <span>Low stock</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-icon mini-stat-icon--danger">
            <PackageX size={18} />
          </span>
          <div>
            <strong>{summary.out}</strong>
            <span>Sold out</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-icon">
            <TrendingUp size={18} />
          </span>
          <div>
            <strong>{formatNumber(summary.sold)}</strong>
            <span>Units sold</span>
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="restock">
          <div className="restock-head">
            <span className="restock-icon">
              <AlertTriangle size={18} />
            </span>
            <div>
              <strong>Restock suggestions</strong>
              <small>Based on remaining stock and sales over the last {analytics.data.period_days} days.</small>
            </div>
          </div>
          <ul className="restock-list">
            {alerts.map((a) => {
              const qty = suggestFor(a)
              return (
                <li key={a.id}>
                  <div className="restock-name">
                    <strong>{a.name}</strong>
                    <small>
                      {a.stock_remaining === 0 ? 'Sold out' : `${a.stock_remaining} left · alert at ${a.low_stock_at}`}
                      {a.days_until_stockout != null && a.stock_remaining > 0 ? ` · runs out in ~${a.days_until_stockout} days` : ''}
                    </small>
                  </div>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      setSuggestQty(qty)
                      setStocking(productFor(a))
                    }}
                  >
                    <Plus size={15} /> Add {qty}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="list-bar">
        <div className="seg-tabs" role="tablist" aria-label="Product views">
          {VIEWS.map((v) => (
            <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="list-bar-right">
          <div className="search-pill">
            <Search size={16} />
            <input placeholder="Search name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
            {search && (
              <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
          <select className="select" value={sortKey} onChange={(e) => setSortKey(e.target.value)} aria-label="Sort products">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="layout-toggle" role="group" aria-label="Layout">
            <button aria-pressed={layout === 'grid'} onClick={() => chooseLayout('grid')} title="Grid view" aria-label="Grid view">
              <LayoutGrid size={16} />
            </button>
            <button aria-pressed={layout === 'table'} onClick={() => chooseLayout('table')} title="Table view" aria-label="Table view">
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : products.length === 0 ? (
        <div className="panel panel-body empty-mini" style={{ padding: 48 }}>
          <Package size={30} />
          <strong>{filtered ? 'No products match' : 'No products yet'}</strong>
          <span>{filtered ? 'Try another tab or search.' : 'Add your first product to start selling.'}</span>
          {!filtered && (
            <button className="btn btn--primary btn--sm" style={{ marginTop: 10 }} onClick={() => setEditing('new')}>
              <Plus size={16} /> New product
            </button>
          )}
        </div>
      ) : layout === 'table' ? (
        <div className={`panel ${loading ? 'is-busy' : ''}`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="num">Price</th>
                  <th>Stock</th>
                  <th>Sales</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <ProductRow
                    key={p.id}
                    p={p}
                    stats={statsById[p.id]}
                    uploading={uploadingId === p.id}
                    onStock={(p) => {
                      setSuggestQty(0)
                      setStocking(p)
                    }}
                    onEdit={setEditing}
                    onPhoto={pickImage}
                    onToggle={toggle}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={`ptile-grid ${loading ? 'is-busy' : ''}`}>
          {products.map((p) => (
            <ProductTile
              key={p.id}
              p={p}
              stats={statsById[p.id]}
              uploading={uploadingId === p.id}
              onStock={(p) => {
                setSuggestQty(0)
                setStocking(p)
              }}
              onEdit={setEditing}
              onPhoto={pickImage}
              onToggle={toggle}
            />
          ))}
        </div>
      )}

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refreshAll()
          }}
        />
      )}
      {stocking && (
        <StockForm
          product={stocking}
          suggested={suggestQty}
          onClose={() => setStocking(null)}
          onSaved={() => {
            setStocking(null)
            refreshAll()
          }}
        />
      )}
    </>
  )
}
