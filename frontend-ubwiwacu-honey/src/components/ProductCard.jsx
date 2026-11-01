import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Pencil, ShoppingBag, Sparkles } from 'lucide-react'
import { HoneyJar } from './Brand.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useCart } from '../context/CartContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatNumber } from '../lib/format.js'
import { productCopy } from '../config/site.js'
import { productImage } from '../config/photos.js'

const QuickView = lazy(() => import('./QuickView.jsx'))

export function ProductMedia({ product, className = '', src: srcProp, eager = false }) {
  const premium = product.category === 'premium'
  const src = srcProp || productImage(product)
  if (src) {
    return (
      <img
        className={`photo ${className}`}
        src={src}
        alt={`${product.name} package`}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    )
  }
  return (
    <HoneyJar
      label={product.package_size || product.size}
      premium={premium}
      title={`Illustration of ${product.name}`}
    />
  )
}

export function StockLabel({ status, left }) {
  const text =
    status === 'out_of_stock' ? 'Out of stock' : status === 'low_stock' ? (left ? `Only ${left} left` : 'Low stock') : 'In stock'
  return <span className={`stock stock--${status}`}>{text}</span>
}

export default function ProductCard({ product }) {
  const { add, openDrawer } = useCart()
  const toast = useToast()
  const premium = product.category === 'premium'
  const copy = productCopy(product)
  const soldOut = !product.in_stock
  const hasPhoto = Boolean(productImage(product))
  const [quick, setQuick] = useState(false)
  // Signed-in catalogue staff get a shortcut to edit this product.
  const auth = useAuth()
  const canEdit = auth?.status === 'authenticated' && ['admin', 'manager'].includes(auth.user?.role)

  const onAdd = () => {
    add(product, 1)
    toast.success(`${product.name} added to your cart.`, {
      action: (
        <button className="btn btn--sm btn--light" style={{ marginLeft: 6 }} onClick={openDrawer}>
          View cart
        </button>
      ),
    })
  }

  return (
    <article className={`product-card ${premium ? 'product-card--premium' : ''}`}>
      <div className={`product-media ${hasPhoto ? 'product-media--photo' : ''}`}>
        {canEdit && (
          <Link to={'/admin/products?q=' + encodeURIComponent(product.name)} className="product-edit" title="Edit in admin" aria-label={'Edit ' + product.name + ' in admin'}>
            <Pencil size={14} /> Edit
          </Link>
        )}
        <div className="product-tags">
          <span className={`badge ${premium ? 'badge--premium' : 'badge--glass'}`}>
            {premium ? (
              <>
                <Sparkles size={13} /> Premium
              </>
            ) : (
              product.package_size
            )}
          </span>
          {product.stock_status !== 'in_stock' && (
            <span className={`badge ${soldOut ? 'badge--danger' : 'badge--warn'}`}>
              {soldOut ? 'Out of stock' : product.stock_left ? `Only ${product.stock_left} left` : 'Low stock'}
            </span>
          )}
        </div>
        <ProductMedia product={product} />
        <button type="button" className="product-quick" onClick={() => setQuick(true)} aria-label={`Quick view: ${product.name}`}>
          <Eye size={17} /> <span>Quick view</span>
        </button>
      </div>
      <div className="product-body">
        <span className="product-kicker">{copy.marketingName}</span>
        <h3>
          <Link to={`/shop/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="product-desc">{product.short_description}</p>
        <div className="product-foot">
          <span className="price" aria-label={`Price ${formatNumber(product.price_rwf)} Rwandan francs`}>
            {formatNumber(product.price_rwf)}
            <small>RWF</small>
          </span>
          <button
            type="button"
            className="btn btn--primary btn--sm product-add"
            onClick={onAdd}
            disabled={soldOut}
            aria-label={`Add ${product.name} to cart`}
          >
            <ShoppingBag size={16} /> Add
          </button>
        </div>
      </div>
      {quick && (
        <Suspense fallback={null}>
          <QuickView product={product} onClose={() => setQuick(false)} />
        </Suspense>
      )}
    </article>
  )
}

export function ProductGridSkeleton({ count = 6 }) {
  return (
    <div className="product-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 440 }} />
      ))}
    </div>
  )
}
