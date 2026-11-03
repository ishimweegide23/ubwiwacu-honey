import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, ChevronDown, CreditCard, Expand, Leaf, MapPin, ShieldCheck, ShoppingBag, Smartphone, Sparkles, Star, Truck } from 'lucide-react'
import { Lightbox } from '../components/QuickView.jsx'
import { WhatsAppIcon } from '../components/Brand.jsx'
import ProductCard, { ProductMedia, StockLabel } from '../components/ProductCard.jsx'
import { Breadcrumb, ErrorState, Loading, QtyStepper } from '../components/ui.jsx'
import { useCart } from '../context/CartContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { assetUrl, shopApi } from '../lib/api.js'
import { productPhotos } from '../config/photos.js'
import { useAsync, usePageMeta } from '../lib/useAsync.js'
import { formatNumber, formatRWF, waLink, waOrderMessage } from '../lib/format.js'
import { DELIVERY_NOTICE, PAYMENT_SAFETY, productCopy } from '../config/site.js'
import NotFound from './NotFound.jsx'

function useProductJsonLd(product) {
  useEffect(() => {
    if (!product) return
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.short_description,
      sku: product.sku,
      brand: { '@type': 'Brand', name: "Ubw'iwacu Honey" },
      weight: { '@type': 'QuantitativeValue', value: product.weight_grams, unitCode: 'GRM' },
      offers: {
        '@type': 'Offer',
        price: product.price_rwf,
        priceCurrency: 'RWF',
        availability: product.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      },
    })
    document.head.appendChild(script)
    return () => script.remove()
  }, [product])
}

export default function ProductDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { add, openDrawer } = useCart()
  const toast = useToast()
  const [qty, setQty] = useState(1)
  const [active, setActive] = useState(0)
  const [zoom, setZoom] = useState(false)
  const all = useAsync(() => shopApi.products({ limit: 50 }), [])
  const { data: product, error, loading, reload } = useAsync(() => shopApi.product(slug), [slug])

  usePageMeta(product?.name, product ? `${product.name} — ${formatRWF(product.price_rwf)}. ${product.short_description}` : undefined)
  useProductJsonLd(product)

  useEffect(() => {
    setQty(1)
    setActive(0)
  }, [slug])

  if (loading) return <Loading label="Loading product…" />
  if (error?.status === 404) return <NotFound title="Product not found" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const copy = productCopy(product)
  const premium = product.category === 'premium'
  const soldOut = !product.in_stock
  const maxQty = product.stock_left || 99
  const uploaded = assetUrl(product.image_url)
  const gallery = [...new Set([uploaded, ...productPhotos(product.slug)].filter(Boolean))]

  const sizes = [...(all.data || [])].sort((a, b) => a.weight_grams - b.weight_grams || (a.category === 'premium') - (b.category === 'premium'))

  const addToCart = (goCheckout = false) => {
    add(product, qty)
    if (goCheckout) {
      navigate('/checkout')
    } else {
      toast.success(`${qty} × ${product.name} added to your cart.`, {
        action: (
          <button className="btn btn--sm btn--light" style={{ marginLeft: 6 }} onClick={openDrawer}>
            View cart
          </button>
        ),
      })
    }
  }

  const waMsg = waOrderMessage([{ name: product.name, size: product.package_size, quantity: qty, price: product.price_rwf }])

  return (
    <>
      <section className="section--tight">
        <div className="container">
          <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Shop', to: '/shop' }, { label: product.name }]} />
          <div className="pd-grid">
            <div className="pd-gallery">
              <div className={`pd-media ${premium ? 'pd-media--premium' : ''}`}>
                <button type="button" className="pd-zoom" onClick={() => gallery.length && setZoom(true)} disabled={!gallery.length} aria-label="Open photos full screen">
                  <ProductMedia key={gallery[active] || 'jar'} product={product} src={gallery[active]} eager className="pd-photo" />
                  {gallery.length > 0 && (
                    <span className="pd-zoom-hint">
                      <Expand size={15} /> {gallery.length > 1 ? `View all ${gallery.length} photos` : 'Enlarge'}
                    </span>
                  )}
                </button>
              </div>
              {gallery.length > 1 && (
                <div className="pd-thumbs" role="group" aria-label="Product photos">
                  {gallery.map((src, i) => (
                    <button
                      key={src}
                      type="button"
                      className="pd-thumb"
                      aria-pressed={i === active}
                      aria-label={`Show photo ${i + 1} of ${gallery.length}`}
                      onClick={() => setActive(i)}
                    >
                      <img src={src} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pd-info">
              <div className="row" style={{ marginBottom: 14 }}>
                {premium ? (
                  <span className="badge badge--premium">
                    <Sparkles size={13} /> Premium package
                  </span>
                ) : (
                  <span className="badge">Standard package</span>
                )}
                <span className="badge badge--muted">{product.package_size}</span>
              </div>
              <h1>{product.name}</h1>
              <p className="pd-tagline">{copy.marketingName}</p>

              <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
                <span className="price price--lg">
                  {formatNumber(product.price_rwf)}
                  <small>RWF</small>
                </span>
                <StockLabel status={product.stock_status} left={product.stock_left} />
              </div>
              <p style={{ marginTop: 14, fontSize: '1.05rem', color: 'var(--ink-2)' }}>{product.short_description}</p>

              {sizes.length > 1 && (
                <div className="pd-sizes">
                  <span className="pd-label">Choose a size</span>
                  <div className="pd-size-grid">
                    {sizes.map((p) => (
                      <Link
                        key={p.id}
                        to={`/shop/${p.slug}`}
                        className={`pd-size ${p.id === product.id ? 'is-on' : ''} ${p.in_stock ? '' : 'is-out'}`}
                        aria-current={p.id === product.id ? 'true' : undefined}
                      >
                        <strong>{p.category === 'premium' ? 'Premium' : p.package_size}</strong>
                        <small>{formatNumber(p.price_rwf)} RWF</small>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="pd-buy">
                <QtyStepper value={qty} onChange={setQty} max={maxQty} />
                <button className="btn btn--primary btn--lg" onClick={() => addToCart(false)} disabled={soldOut}>
                  <ShoppingBag size={18} /> {soldOut ? 'Out of stock' : `Add · ${formatRWF(product.price_rwf * qty)}`}
                </button>
                <button className="btn btn--dark btn--lg" onClick={() => addToCart(true)} disabled={soldOut}>
                  Buy now
                </button>
                <a className="btn btn--whatsapp btn--lg" href={waLink(waMsg)} target="_blank" rel="noreferrer" style={{ flexBasis: '100%' }}>
                  <WhatsAppIcon size={18} /> Order on WhatsApp
                </a>
              </div>

              <ul className="pd-trust">
                <li>
                  <Leaf size={17} /> 100% natural honey
                </li>
                <li>
                  <MapPin size={17} /> Made in Rwanda
                </li>
                <li>
                  <Smartphone size={17} /> Pay with MoMo, Airtel or bank
                </li>
              </ul>

              {copy.cta && (
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontStyle: 'italic', color: 'var(--honey-700)' }}>
                  {copy.cta}
                </p>
              )}

              <div className="accordion" style={{ marginTop: 20 }}>
                <details open>
                  <summary>
                    The story <ChevronDown size={20} />
                  </summary>
                  <div className="acc-body">
                    {copy.story.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                    {copy.idealFor && (
                      <p className="mb-0">
                        <strong>Ideal for:</strong> {copy.idealFor}
                      </p>
                    )}
                  </div>
                </details>
                {copy.uses.length > 0 && (
                  <details open>
                    <summary>
                      Suggested uses <ChevronDown size={20} />
                    </summary>
                    <div className="acc-body">
                      <ul className="uses">
                        {copy.uses.map((u) => (
                          <li key={u}>
                            <Check size={14} /> {u}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                )}
                <details>
                  <summary>
                    <span className="row" style={{ gap: 10 }}>
                      <Truck size={18} /> Delivery policy
                    </span>
                    <ChevronDown size={20} />
                  </summary>
                  <div className="acc-body">
                    <p>{DELIVERY_NOTICE}</p>
                    <p className="mb-0">
                      No delivery fee is added by our website. <Link to="/policies/delivery-returns">Read the full delivery &amp; refund policy</Link>.
                    </p>
                  </div>
                </details>
                <details>
                  <summary>
                    <span className="row" style={{ gap: 10 }}>
                      <CreditCard size={18} /> Payment
                    </span>
                    <ChevronDown size={20} />
                  </summary>
                  <div className="acc-body">
                    <p>
                      After you place your order you will receive payment instructions. Once you have paid, submit your
                      transaction reference on the order page. Your order is confirmed after our team verifies the
                      payment, and you then receive a payment receipt.
                    </p>
                    <p className="mb-0 row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                      <ShieldCheck size={18} style={{ color: 'var(--forest-600)', flexShrink: 0, marginTop: 3 }} /> {PAYMENT_SAFETY}
                    </p>
                  </div>
                </details>
                <details>
                  <summary>
                    <span className="row" style={{ gap: 10 }}>
                      <Star size={18} /> Customer reviews
                    </span>
                    <ChevronDown size={20} />
                  </summary>
                  <div className="acc-body">
                    <p className="mb-0 muted">
                      No reviews yet. We publish only genuine reviews from customers who have received their order and
                      agreed to share their feedback.
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      </section>

      {zoom && <Lightbox photos={gallery} start={active} alt={product.name} onClose={() => setZoom(false)} />}

      {product.related?.length > 0 && (
        <section className="section section--paper">
          <div className="container">
            <div className="section-head section-head--left">
              <span className="eyebrow">You may also like</span>
              <h2>Related packages</h2>
            </div>
            <div className="product-grid">
              {product.related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
