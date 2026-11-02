import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const CartContext = createContext(null)
const STORAGE_KEY = 'ubh_cart_v1'
export const MAX_QTY = 99

/**
 * Cart lines are a display snapshot: { productId, slug, name, size, price, image, category, quantity }.
 * The server always re-prices the order from the database at checkout.
 */
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((l) => l && l.productId && l.quantity > 0) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState(load)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  }, [lines])

  // Keep tabs in sync.
  useEffect(() => {
    const onStorage = (e) => e.key === STORAGE_KEY && setLines(load())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const add = useCallback((product, quantity = 1) => {
    const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(quantity)))
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id)
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + qty), price: product.price_rwf } : l,
        )
      }
      return [
        ...prev,
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          size: product.package_size,
          price: product.price_rwf,
          image: product.image_url,
          category: product.category,
          quantity: qty,
        },
      ]
    })
  }, [])

  const setQuantity = useCallback((productId, quantity) => {
    const q = Math.floor(Number(quantity))
    setLines((prev) =>
      q <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, q) } : l)),
    )
  }, [])

  const remove = useCallback((productId) => setLines((prev) => prev.filter((l) => l.productId !== productId)), [])
  const clear = useCallback(() => setLines([]), [])

  /** Refresh names/prices from fresh product data (e.g. after loading the catalogue). */
  const syncProducts = useCallback((products) => {
    const byId = new Map(products.map((p) => [p.id, p]))
    setLines((prev) => {
      let changed = false
      const next = prev.map((l) => {
        const p = byId.get(l.productId)
        if (!p) return l
        if (p.price_rwf !== l.price || p.name !== l.name || p.image_url !== l.image) {
          changed = true
          return { ...l, price: p.price_rwf, name: p.name, size: p.package_size, image: p.image_url }
        }
        return l
      })
      return changed ? next : prev
    })
  }, [])

  const value = useMemo(() => {
    const count = lines.reduce((s, l) => s + l.quantity, 0)
    const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0)
    return {
      lines,
      count,
      subtotal,
      add,
      setQuantity,
      remove,
      clear,
      syncProducts,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    }
  }, [lines, add, setQuantity, remove, clear, syncProducts, drawerOpen])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCart = () => useContext(CartContext)
