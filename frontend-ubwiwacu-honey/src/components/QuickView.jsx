import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Expand, ShoppingBag, Sparkles, X } from 'lucide-react'
import { WhatsAppIcon } from './Brand.jsx'
import { ProductMedia, StockLabel } from './ProductCard.jsx'
import { QtyStepper } from './ui.jsx'
import { useCart } from '../context/CartContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { assetUrl } from '../lib/api.js'
import { formatNumber, formatRWF, waLink, waOrderMessage } from '../lib/format.js'
import { productPhotos } from '../config/photos.js'
import { productCopy } from '../config/site.js'

/** Every photo for a product: the uploaded one first, then our own shots. */
const galleryOf = (product) => [...new Set([assetUrl(product?.image_url), ...productPhotos(product?.slug)].filter(Boolean))]

/** Locks page scroll and closes on Escape while an overlay is open. */
function useOverlay(onClose, onKey) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      else onKey?.(e)
    }
    document.addEventListener('keydown', handler)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prev
    }
  }, [onClose, onKey])
}

/** Full-screen photo viewer with arrows, keyboard and thumbnails. */
export function Lightbox({ photos, start = 0, alt = '', onClose }) {
  const [i, setI] = useState(start)
  const n = photos.length
  const prev = useCallback(() => setI((v) => (v - 1 + n) % n), [n])
  const next = useCallback(() => setI((v) => (v + 1) % n), [n])
  const onKey = useCallback((e) => (e.key === 'ArrowLeft' ? prev() : e.key === 'ArrowRight' ? next() : null), [prev, next])
  useOverlay(onClose, onKey)

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close photo viewer">
        <X size={22} />
      </button>
      {n > 1 && (
        <button className="lightbox-nav lightbox-nav--prev" onClick={prev} aria-label="Previous photo">
          <ChevronLeft size={26} />
        </button>
      )}
      <figure className="lightbox-figure">
        <img key={photos[i]} src={photos[i]} alt={alt} />
        <figcaption>
          {i + 1} / {n}
        </figcaption>
      </figure>
      {n > 1 && (
        <button className="lightbox-nav lightbox-nav--next" onClick={next} aria-label="Next photo">
          <ChevronRight size={26} />
        </button>
      )}
      {n > 1 && (
        <div className="lightbox-thumbs">
          {photos.map((src, k) => (
            <button key={src} aria-pressed={k === i} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}>
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}

/** Product quick view: photos, price, quantity and add-to-cart without leaving the page. */
export default function QuickView({ product, onClose }) {
  const { add, openDrawer } = useCart()
  const toast = useToast()
  const [qty, setQty] = useState(1)
  const [active, setActive] = useState(0)
  const [zoom, setZoom] = useState(false)
  useOverlay(zoom ? () => {} : onClose)

  const photos = galleryOf(product)
  const copy = productCopy(product)
  const premium = product.category === 'premium'
  const soldOut = !product.in_stock
  const waMsg = waOrderMessage([{ name: product.name, size: product.package_size, quantity: qty, price: product.price_rwf }])

  const addToCart = () => {
    add(product, qty)
    onClose()
    toast.success(`${qty} × ${product.name} added to your cart.`, {
      action: (
        <button className="btn btn--sm btn--light" style={{ marginLeft: 6 }} onClick={openDrawer}>
          View cart
        </button>
      ),
    })
  }

  return createPortal(
    <div className="qv-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qv" role="dialog" aria-modal="true" aria-label={`Quick view: ${product.name}`}>
        <button className="qv-close" onClick={onClose} aria-label="Close quick view">
          <X size={20} />
        </button>

        <div className={`qv-media ${premium ? 'qv-media--premium' : ''}`}>
          <button className="qv-main" onClick={() => photos.length && setZoom(true)} aria-label="Open photo full screen" disabled={!photos.length}>
            <ProductMedia key={photos[active] || 'jar'} product={product} src={photos[active]} eager />
            {photos.length > 0 && (
              <span className="qv-zoom">
                <Expand size={15} /> Tap to enlarge
              </span>
            )}
          </button>
          {photos.length > 1 && (
            <div className="qv-thumbs">
              {photos.map((src, i) => (
                <button key={src} aria-pressed={i === active} onClick={() => setActive(i)} aria-label={`Show photo ${i + 1}`}>
                  <img src={src} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="qv-info">
          <span className={`badge ${premium ? 'badge--premium' : ''}`}>
            {premium ? (
              <>
                <Sparkles size={12} /> Premium
              </>
            ) : (
              product.package_size
            )}
          </span>
          <h2>{product.name}</h2>
          <p className="qv-kicker">{copy.marketingName}</p>
          <div className="qv-price">
            <span className="price price--lg">
              {formatNumber(product.price_rwf)}
              <small>RWF</small>
            </span>
            <StockLabel status={product.stock_status} left={product.stock_left} />
          </div>
          <p className="qv-desc">{product.short_description}</p>
          {copy.uses?.length > 0 && (
            <ul className="qv-uses">
              {copy.uses.slice(0, 4).map((u) => (
                <li key={u}>
                  <Check size={14} /> {u}
                </li>
              ))}
            </ul>
          )}
          <div className="qv-buy">
            <QtyStepper value={qty} onChange={setQty} max={product.stock_left || 99} />
            <button className="btn btn--primary btn--lg" onClick={addToCart} disabled={soldOut}>
              <ShoppingBag size={18} /> {soldOut ? 'Out of stock' : `Add · ${formatRWF(product.price_rwf * qty)}`}
            </button>
          </div>
          <div className="qv-links">
            <Link to={`/shop/${product.slug}`} className="link-arrow" onClick={onClose}>
              Full details <ArrowRight size={15} />
            </Link>
            <a className="qv-wa" href={waLink(waMsg)} target="_blank" rel="noreferrer">
              <WhatsAppIcon size={16} /> Order on WhatsApp
            </a>
          </div>
        </div>
      </div>
      {zoom && <Lightbox photos={photos} start={active} alt={product.name} onClose={() => setZoom(false)} />}
    </div>,
    document.body,
  )
}
