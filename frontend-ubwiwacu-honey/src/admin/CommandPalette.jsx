import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ClipboardList, CornerDownLeft, Loader2, Package, Plus, Search, User, X } from 'lucide-react'
import { FulfilmentBadge, PaymentBadge } from '../components/ui.jsx'
import { adminApi } from '../lib/api.js'
import { formatRWF, timeAgo } from '../lib/format.js'

/**
 * Global search (Ctrl/⌘ + K). Pages and actions are filtered locally; orders,
 * customers and products come from GET /api/admin/search.
 * `pages` = [{ to, label, icon }] the user may open; `canSearch` = role may use the API.
 */
export default function CommandPalette({ pages, canSearch, canOrder, onClose }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [remote, setRemote] = useState(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Live search, after a short pause.
  useEffect(() => {
    const term = q.trim()
    if (!canSearch || term.length < 2) {
      setRemote(null)
      return undefined
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await adminApi.search(term, ctrl.signal)
        setRemote(res.data)
      } catch (err) {
        if (err.name !== 'AbortError') setRemote({ orders: [], customers: [], products: [], error: err.message })
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, canSearch])

  const items = useMemo(() => {
    const term = q.trim().toLowerCase()
    const out = []
    const actions = [
      canOrder && { group: 'Actions', key: 'a-new', label: 'Create a manual order', icon: Plus, to: '/admin/orders/new' },
      { group: 'Actions', key: 'a-shop', label: 'Open the shop', icon: ArrowRight, href: '/' },
    ].filter(Boolean)
    for (const a of actions) if (!term || a.label.toLowerCase().includes(term)) out.push(a)
    for (const p of pages) if (!term || p.label.toLowerCase().includes(term)) out.push({ group: 'Pages', key: `p-${p.to}`, label: p.label, icon: p.icon, to: p.to })
    if (remote) {
      for (const o of remote.orders) {
        out.push({
          group: 'Orders',
          key: `o-${o.id}`,
          icon: ClipboardList,
          label: o.order_number,
          sub: `${o.customer_name} · ${o.customer_phone} · ${timeAgo(o.created_at)}`,
          right: formatRWF(o.total_rwf),
          badges: o,
          to: `/admin/orders/${o.id}`,
        })
      }
      for (const c of remote.customers) {
        out.push({
          group: 'Customers',
          key: `c-${c.id}`,
          icon: User,
          label: c.name,
          sub: [c.phone, c.email].filter(Boolean).join(' · '),
          right: `${c.order_count} order${c.order_count === 1 ? '' : 's'}`,
          to: `/admin/customers?id=${c.id}`,
        })
      }
      for (const p of remote.products) {
        out.push({
          group: 'Products',
          key: `pr-${p.id}`,
          icon: Package,
          label: p.name,
          sub: `${p.sku || 'No SKU'} · ${p.stock_qty} in stock${p.is_available ? '' : ' · hidden'}`,
          right: formatRWF(p.price_rwf),
          to: `/admin/products?q=${encodeURIComponent(p.name)}`,
        })
      }
    }
    return out
  }, [q, remote, pages, canOrder])

  useEffect(() => setActive(0), [q, remote])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const open = (item) => {
    onClose()
    if (item.href) window.open(item.href, '_blank', 'noopener')
    else navigate(item.to)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault()
      open(items[active])
    }
  }

  const term = q.trim()
  let lastGroup = null

  return createPortal(
    <div className="cmdk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search">
        <div className="cmdk-input">
          {loading ? <Loader2 size={20} className="spin" /> : <Search size={20} />}
          <input
            autoFocus
            placeholder={canSearch ? 'Search orders, customers, products or pages…' : 'Search pages…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={items[active] ? `cmdk-${items[active].key}` : undefined}
          />
          <button className="cmdk-esc" onClick={onClose} aria-label="Close search">
            <X size={14} /> <span>Esc</span>
          </button>
        </div>

        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {items.length === 0 && (
            <div className="cmdk-empty">
              {term.length < 2 && canSearch ? 'Type at least 2 letters to search orders, customers and products.' : loading ? 'Searching…' : `Nothing found for “${term}”.`}
              {remote?.error && <small>{remote.error}</small>}
            </div>
          )}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            const Icon = it.icon
            return (
              <div key={it.key}>
                {header && <div className="cmdk-group">{header}</div>}
                <div
                  id={`cmdk-${it.key}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  className={`cmdk-item ${i === active ? 'is-active' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => open(it)}
                >
                  <span className="cmdk-icon">
                    <Icon size={17} />
                  </span>
                  <span className="cmdk-text">
                    <strong>{it.label}</strong>
                    {it.sub && <small>{it.sub}</small>}
                  </span>
                  {it.badges && (
                    <span className="cmdk-badges">
                      <PaymentBadge status={it.badges.payment_status} />
                      <FulfilmentBadge status={it.badges.fulfilment_status} />
                    </span>
                  )}
                  {it.right && <span className="cmdk-right">{it.right}</span>}
                  <CornerDownLeft size={15} className="cmdk-enter" />
                </div>
              </div>
            )
          })}
        </div>

        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to open
          </span>
          <span>
            <kbd>Ctrl</kbd>
            <kbd>K</kbd> anywhere
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
