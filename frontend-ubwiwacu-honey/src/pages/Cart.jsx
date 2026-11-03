import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Lock, Plus, ShieldCheck, ShoppingBag, Smartphone, Trash2, Truck, Building } from 'lucide-react'
import { ProductMedia } from '../components/ProductCard.jsx'
import { QtyStepper } from '../components/ui.jsx'
import { WhatsAppIcon } from '../components/Brand.jsx'
import { useCart } from '../context/CartContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { shopApi } from '../lib/api.js'
import { useAsync, usePageMeta } from '../lib/useAsync.js'
import { formatNumber, formatRWF, waLink, waOrderMessage } from '../lib/format.js'
import { DELIVERY_NOTICE, PAYMENT_SAFETY } from '../config/site.js'
import { PHOTOS, productImage } from '../config/photos.js'

function CartSteps() {
  return (
    <ol className="checkout-steps" aria-label="Order progress">
      <li className="current">
        <span className="dot">1</span> Cart
      </li>
      <li className="sep" aria-hidden="true" />
      <li>
        <span className="dot">2</span> Details
      </li>
      <li className="sep" aria-hidden="true" />
      <li>
        <span className="dot">3</span> Pay &amp; confirm
      </li>
    </ol>
  )
}

/** Other packages the customer may want, with one-tap add. */
function AddMore({ exclude = [], title }) {
  const { add } = useCart()
  const toast = useToast()
  const { data } = useAsync(() => shopApi.products({ limit: 50 }), [])
  const items = (data || []).filter((p) => p.in_stock && !exclude.includes(p.id)).sort((a, b) => a.weight_grams - b.weight_grams)
  if (!items.length) return null
  return (
    <section className="addmore">
      <h2>{title}</h2>
      <div className="addmore-row">
        {items.map((p) => {
          const src = productImage(p)
          return (
            <div key={p.id} className="addmore-item">
              <Link to={`/shop/${p.slug}`} className="addmore-img">
                {src ? <img src={src} alt="" loading="lazy" /> : <ProductMedia product={p} />}
              </Link>
              <div className="addmore-text">
                <strong>{p.category === 'premium' ? 'Premium 1 kg' : p.package_size}</strong>
                <small>{formatNumber(p.price_rwf)} RWF</small>
              </div>
              <button
                className="addmore-btn"
                onClick={() => {
                  add(p, 1)
                  toast.success(`${p.name} added.`)
                }}
                aria-label={`Add ${p.name} to cart`}
              >
                <Plus size={17} />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function Cart() {
  usePageMeta('Your Cart')
  const { lines, subtotal, count, setQuantity, remove, clear } = useCart()
  const navigate = useNavigate()

  if (lines.length === 0) {
    return (
      <section className="section cart-page">
        <div className="container">
          <div className="cart-empty-v3">
            <div className="cart-empty-comb" aria-hidden="true">
              <img src={PHOTOS.g500Studio} alt="" />
              <img src={PHOTOS.kg1Street} alt="" />
              <img src={PHOTOS.kg7Jug} alt="" />
            </div>
            <h1>Your cart is empty</h1>
            <p>Find the honey package that suits your home, family or business.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link to="/shop" className="btn btn--primary btn--lg">
                Shop honey <ArrowRight size={18} />
              </Link>
              <Link to="/" className="btn btn--outline btn--lg">
                Back home
              </Link>
            </div>
          </div>
          <AddMore title="Popular right now" />
        </div>
      </section>
    )
  }

  return (
    <section className="section--tight cart-page">
      <div className="container">
        <div className="cart-top">
          <div>
            <CartSteps />
            <h1 className="page-title">
              Your cart <span className="count-chip">{count}</span>
            </h1>
          </div>
          <Link to="/shop" className="link-arrow">
            <ArrowLeft size={18} /> Continue shopping
          </Link>
        </div>

        <div className="cart-layout">
          <div>
            <ul className="cart-lines">
              {lines.map((l) => (
                <li key={l.productId} className="cl">
                  <Link to={`/shop/${l.slug}`} className="cl-img" aria-label={l.name}>
                    <ProductMedia product={{ ...l, package_size: l.size }} />
                  </Link>
                  <div className="cl-info">
                    <span className="cl-size">{l.category === 'premium' ? 'Premium' : l.size}</span>
                    <h3>
                      <Link to={`/shop/${l.slug}`}>{l.name}</Link>
                    </h3>
                    <span className="small muted">{formatRWF(l.price)} each</span>
                    <div className="cl-actions">
                      <QtyStepper size="sm" value={l.quantity} onChange={(q) => setQuantity(l.productId, q)} label={`Quantity of ${l.name}`} />
                      <button className="cl-remove" onClick={() => remove(l.productId)} aria-label={`Remove ${l.name}`}>
                        <Trash2 size={16} /> <span>Remove</span>
                      </button>
                    </div>
                  </div>
                  <div className="cl-total">{formatRWF(l.price * l.quantity)}</div>
                </li>
              ))}
            </ul>
            <div className="cart-foot-row">
              <button className="link-btn" onClick={clear}>
                <Trash2 size={14} /> Empty cart
              </button>
              <span className="small muted">Prices are confirmed by our system when you place the order.</span>
            </div>
            <AddMore title="Add to your order" exclude={lines.map((l) => l.productId)} />
          </div>

          <aside className="summary">
            <div className="summary-card cart-summary">
              <h2>Order summary</h2>
              <div className="summary-row">
                <span>
                  Products ({count} item{count === 1 ? '' : 's'})
                </span>
                <strong>{formatRWF(subtotal)}</strong>
              </div>
              <div className="summary-row">
                <span>Delivery</span>
                <span className="muted">Paid to your rider</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span>{formatRWF(subtotal)}</span>
              </div>
              <button className="btn btn--primary btn--block btn--lg" style={{ marginTop: 18 }} onClick={() => navigate('/checkout')}>
                <Lock size={17} /> Checkout securely <ArrowRight size={18} />
              </button>
              <a className="btn btn--whatsapp btn--block" style={{ marginTop: 10 }} href={waLink(waOrderMessage(lines))} target="_blank" rel="noreferrer">
                <WhatsAppIcon size={18} /> Send order on WhatsApp
              </a>
              <div className="cart-pay">
                <span className="pay-chip pay-chip--mtn">
                  <Smartphone size={13} /> MTN MoMo
                </span>
                <span className="pay-chip pay-chip--airtel">
                  <Smartphone size={13} /> Airtel
                </span>
                <span className="pay-chip pay-chip--light">
                  <Building size={13} /> Bank
                </span>
              </div>
              <p className="cart-safe">
                <ShieldCheck size={16} /> {PAYMENT_SAFETY}
              </p>
            </div>
            <div className="co-notice">
              <Truck size={16} /> <span>{DELIVERY_NOTICE}</span>
            </div>
            <div className="cart-help">
              <ShoppingBag size={16} /> Buying for a business?{' '}
              <Link to="/business">Ask for a bulk quote</Link>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
