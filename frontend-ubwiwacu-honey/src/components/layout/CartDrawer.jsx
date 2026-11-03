import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ShoppingBag, Trash2, Truck, X } from 'lucide-react'
import { useCart } from '../../context/CartContext.jsx'
import { ProductMedia } from '../ProductCard.jsx'
import { QtyStepper } from '../ui.jsx'
import { WhatsAppIcon } from '../Brand.jsx'
import { formatRWF, waLink, waOrderMessage } from '../../lib/format.js'
import { PHOTOS } from '../../config/photos.js'

export default function CartDrawer() {
  const { lines, subtotal, count, setQuantity, remove, drawerOpen, closeDrawer } = useCart()
  const navigate = useNavigate()

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e) => e.key === 'Escape' && closeDrawer()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen, closeDrawer])

  if (!drawerOpen) return null

  const go = (path) => {
    closeDrawer()
    navigate(path)
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={closeDrawer} />
      <aside className="drawer cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping cart">
        <div className="drawer-head">
          <h2 className="row" style={{ gap: 10 }}>
            <ShoppingBag size={22} /> Your cart
            {count > 0 && <span className="count-chip">{count}</span>}
          </h2>
          <button className="icon-btn" onClick={closeDrawer} aria-label="Close cart">
            <X size={22} />
          </button>
        </div>
        <div className="drawer-body">
          {lines.length === 0 ? (
            <div className="cart-empty">
              <img src={PHOTOS.g500Studio} alt="" />
              <h3>Your cart is empty</h3>
              <p>Find the honey package that suits your home, family or business.</p>
              <button className="btn btn--primary" onClick={() => go('/shop')}>
                Shop honey <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <ul className="mini-lines">
              {lines.map((l) => (
                <li key={l.productId} className="mini-line">
                  <div className="cart-thumb">
                    <ProductMedia product={{ ...l, package_size: l.size }} />
                  </div>
                  <div className="mini-line-info">
                    <div className="row row--between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                      <h3>
                        <Link to={`/shop/${l.slug}`} onClick={closeDrawer}>
                          {l.name}
                        </Link>
                      </h3>
                      <button className="icon-btn icon-btn--sm" onClick={() => remove(l.productId)} aria-label={`Remove ${l.name}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <span className="muted small">{formatRWF(l.price)} each</span>
                    <div className="row row--between" style={{ marginTop: 8 }}>
                      <QtyStepper size="sm" value={l.quantity} onChange={(q) => setQuantity(l.productId, q)} label={`Quantity of ${l.name}`} />
                      <strong className="line-total">{formatRWF(l.price * l.quantity)}</strong>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {lines.length > 0 && (
          <div className="drawer-foot stack" style={{ gap: 12 }}>
            <div className="summary-row" style={{ fontWeight: 700, fontSize: '1.15rem', padding: 0 }}>
              <span>Subtotal</span>
              <span>{formatRWF(subtotal)}</span>
            </div>
            <p className="small muted row" style={{ gap: 6, margin: 0, flexWrap: 'nowrap' }}>
              <Truck size={15} style={{ flexShrink: 0 }} /> Delivery is not included and is arranged by you.
            </p>
            <button className="btn btn--primary btn--block btn--lg" onClick={() => go('/checkout')}>
              Checkout <ArrowRight size={18} />
            </button>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
              <button className="btn btn--outline" style={{ flex: 1 }} onClick={() => go('/cart')}>
                View cart
              </button>
              <a className="btn btn--whatsapp" style={{ flex: 1 }} href={waLink(waOrderMessage(lines))} target="_blank" rel="noreferrer">
                <WhatsAppIcon size={17} /> WhatsApp
              </a>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
