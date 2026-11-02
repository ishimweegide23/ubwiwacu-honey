import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownUp, Coffee, Gift, Home as HomeIcon, Search, Sparkles, Truck, Users, UtensilsCrossed, X } from 'lucide-react'
import ProductCard, { ProductGridSkeleton } from '../components/ProductCard.jsx'
import { WhatsAppIcon } from '../components/Brand.jsx'
import { EmptyState, ErrorState } from '../components/ui.jsx'
import { useCart } from '../context/CartContext.jsx'
import { shopApi } from '../lib/api.js'
import { useAsync, usePageMeta } from '../lib/useAsync.js'
import { waLink } from '../lib/format.js'
import { PHOTOS } from '../config/photos.js'
import { DELIVERY_NOTICE } from '../config/site.js'

const SIZES = [
  { value: '', label: 'All' },
  { value: '350g', label: '350 g' },
  { value: '500g', label: '500 g' },
  { value: '1kg', label: '1 kg' },
  { value: '5kg', label: '5 kg' },
  { value: '7kg', label: '7 kg' },
]
const CATEGORIES = [
  { value: '', label: 'Every package' },
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
]
const SORTS = [
  { value: '', label: 'Size: small to large' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]
const sorters = {
  '': (a, b) => a.weight_grams - b.weight_grams || a.price_rwf - b.price_rwf,
  'price-asc': (a, b) => a.price_rwf - b.price_rwf,
  'price-desc': (a, b) => b.price_rwf - a.price_rwf,
}

const GUIDE = [
  { icon: Sparkles, size: '350 g', size_q: '350g', who: 'A first taste', text: 'Try it in your tea and breakfast.' },
  { icon: HomeIcon, size: '500 g', size_q: '500g', who: 'Everyday', text: 'For one or two people, every day.' },
  { icon: Users, size: '1 kg', size_q: '1kg', who: 'Families', text: 'Breakfasts, cooking and sharing.' },
  { icon: Coffee, size: '5 kg', size_q: '5kg', who: 'Stock up', text: 'Big homes, cafés and regular users.' },
  { icon: UtensilsCrossed, size: '7 kg', size_q: '7kg', who: 'Kitchens', text: 'Restaurants and food businesses.' },
  { icon: Gift, size: 'Premium', cat: 'premium', who: 'Gifting', text: 'Special occasions and corporate gifts.' },
]

export default function Shop() {
  usePageMeta('Shop Honey', "Shop all Ubw'iwacu Honey packages: 350 g, 500 g, 1 kg, 5 kg, 7 kg and Premium 1 kg. Filter by size and category.")
  const [params, setParams] = useSearchParams()
  const size = params.get('size') || ''
  const category = params.get('category') || ''
  const q = params.get('q') || ''
  const sort = params.get('sort') || ''
  const { syncProducts } = useCart()

  const { data, error, loading, reload } = useAsync(() => shopApi.products({ size, category, q, limit: 50 }), [size, category, q])
  const products = useMemo(() => [...(data || [])].sort(sorters[sort] || sorters['']), [data, sort])

  useEffect(() => {
    if (data?.length) syncProducts(data)
  }, [data, syncProducts])

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const pickGuide = (g) => {
    const next = new URLSearchParams()
    if (g.size_q) next.set('size', g.size_q)
    if (g.cat) next.set('category', g.cat)
    setParams(next, { replace: true })
    document.getElementById('shop-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const hasFilters = size || category || q

  return (
    <>
      <section className="shop-hero">
        <div className="container shop-hero-grid">
          <div>
            <span className="eyebrow">The shop</span>
            <h1>
              Pick your <em>honey.</em>
            </h1>
            <p>Six packages of the same natural Rwandan honey. Prices are per package, in Rwandan francs. No account needed to order.</p>
            <form
              role="search"
              className="shop-search"
              onSubmit={(e) => {
                e.preventDefault()
                setParam('q', new FormData(e.currentTarget).get('q')?.toString().trim())
              }}
            >
              <Search size={19} />
              <label htmlFor="shop-q" className="sr-only">
                Search products
              </label>
              <input id="shop-q" name="q" placeholder="Search: 1 kg, gift, premium…" defaultValue={q} key={q} />
              <button className="btn btn--dark btn--sm">Search</button>
            </form>
          </div>
          <div className="shop-hero-art" aria-hidden="true">
            <img src={PHOTOS.mixStack} alt="" className="shop-hero-img shop-hero-img--a" />
            <img src={PHOTOS.kg7Jug} alt="" className="shop-hero-img shop-hero-img--b" />
            <img src={PHOTOS.g500Single} alt="" className="shop-hero-img shop-hero-img--c" />
          </div>
        </div>
      </section>

      <div className="shop-bar">
        <div className="container shop-bar-inner">
          <div className="seg" role="group" aria-label="Filter by package size">
            {SIZES.map((s) => (
              <button key={s.value} aria-pressed={size === s.value} onClick={() => setParam('size', s.value)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="shop-bar-right">
            <select className="select" value={category} onChange={(e) => setParam('category', e.target.value)} aria-label="Category">
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <label className="sort">
              <ArrowDownUp size={16} />
              <select value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="Sort products">
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <section className="section--tight" id="shop-grid">
        <div className="container">
          <div className="shop-count">
            <span>
              {loading ? 'Loading honey…' : `${products.length} package${products.length === 1 ? '' : 's'}`}
              {q && (
                <>
                  {' '}
                  for “<strong>{q}</strong>”
                </>
              )}
            </span>
            {hasFilters && (
              <button className="link-btn" onClick={() => setParams({}, { replace: true })}>
                <X size={14} /> Clear filters
              </button>
            )}
          </div>

          {loading && !data ? (
            <ProductGridSkeleton />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : products.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No honey matches those filters"
              action={
                <button className="btn btn--outline" onClick={() => setParams({}, { replace: true })}>
                  Show all products
                </button>
              }
            >
              Try another size or category.
            </EmptyState>
          ) : (
            <div className={`product-grid ${loading ? 'is-busy' : ''}`}>
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section section--paper">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Size guide</span>
            <h2>Which size is right for you?</h2>
            <p>Tap a size to see it.</p>
          </div>
          <div className="guide">
            {GUIDE.map((g) => {
              const Icon = g.icon
              const on = (g.size_q && size === g.size_q) || (g.cat && category === g.cat)
              return (
                <button key={g.size} className={`guide-card ${on ? 'is-on' : ''}`} onClick={() => pickGuide(g)}>
                  <span className="hex-icon">
                    <Icon size={20} />
                  </span>
                  <strong>{g.size}</strong>
                  <em>{g.who}</em>
                  <small>{g.text}</small>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="section--tight">
        <div className="container">
          <div className="shop-help">
            <div className="shop-help-text">
              <Truck size={22} />
              <div>
                <strong>About delivery</strong>
                <p>{DELIVERY_NOTICE}</p>
              </div>
            </div>
            <a className="btn btn--whatsapp" href={waLink("Hello Ubw'iwacu Honey. I need help choosing a honey size.")} target="_blank" rel="noreferrer">
              <WhatsAppIcon size={18} /> Ask us on WhatsApp
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
