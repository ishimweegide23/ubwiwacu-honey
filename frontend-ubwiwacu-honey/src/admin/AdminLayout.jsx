import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  ChevronsLeft,
  ClipboardList,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Package,
  Plus,
  Receipt,
  ScrollText,
  Search,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { Logo, LogoMark } from '../components/Brand.jsx'
import { adminHome, canAccess, ROLE_GROUPS } from '../components/ProtectedRoute.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { adminApi } from '../lib/api.js'
import { formatRWF, humanize, timeAgo } from '../lib/format.js'
import { SITE } from '../config/site.js'
import '../admin.css'

const CommandPalette = lazy(() => import('./CommandPalette.jsx'))

const LINKS = [
  { group: 'Overview' },
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ROLE_GROUPS.DASHBOARD },
  { group: 'Sales' },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList, roles: ROLE_GROUPS.ORDERS },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard, badge: 'verification', roles: ROLE_GROUPS.PAYMENTS },
  { to: '/admin/receipts', label: 'Receipts', icon: Receipt, roles: ROLE_GROUPS.RECEIPTS },
  { to: '/admin/pos', label: 'Point of Sale', icon: Monitor, roles: ROLE_GROUPS.POS },
  { to: '/admin/customers', label: 'Customers', icon: Users, roles: ROLE_GROUPS.ORDERS },
  { group: 'Catalogue' },
  { to: '/admin/products', label: 'Products & stock', icon: Package, roles: ROLE_GROUPS.CATALOGUE },
  { group: 'Insights' },
  { to: '/admin/reports', label: 'Reports & analytics', icon: BarChart3, roles: ROLE_GROUPS.REPORTS },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText, roles: ROLE_GROUPS.AUDIT },
  { group: 'You' },
  { to: '/admin/account', label: 'Account & security', icon: UserCog },
]

const COLLAPSE_KEY = 'ubh_admin_sidebar'
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Sidebar entries the current role may open; group headings with no visible links are dropped. */
function visibleLinks(role) {
  const out = []
  for (const l of LINKS) {
    if (l.group) out.push(l)
    else if (canAccess(role, l.roles)) out.push(l)
  }
  return out.filter((l, i) => !l.group || (out[i + 1] && !out[i + 1].group))
}

/** Title of the current page for the top bar, e.g. "Orders" for /admin/orders/123. */
function pageTitle(pathname) {
  if (pathname === '/admin/orders/new') return ['Orders', 'New order']
  const match = LINKS.filter((l) => l.to && (pathname === l.to || (!l.end && pathname.startsWith(`${l.to}/`)))).pop()
  if (!match) return ['Dashboard']
  const detail = pathname !== match.to ? 'Details' : null
  return detail ? [match.label, detail] : [match.label]
}

/** Closes a popover on outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return { open, setOpen, ref }
}

function UserMenu({ user, onLogout }) {
  const { open, setOpen, ref } = usePopover()
  const initial = (user?.name || 'A').slice(0, 1).toUpperCase()
  return (
    <div className="user-menu" ref={ref}>
      <button className="user-chip" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <span className="avatar">{initial}</span>
        <span className="user-chip-text">
          <strong>{user?.name}</strong>
          <small>{user?.role}</small>
        </span>
      </button>
      {open && (
        <div className="user-pop" role="menu">
          <div className="user-pop-head">
            <span className="avatar avatar--lg">{initial}</span>
            <div style={{ minWidth: 0 }}>
              <strong>{user?.name}</strong>
              <span>{user?.email}</span>
              <span className="role-pill">{user?.role}</span>
            </div>
          </div>
          <Link to="/admin/account" role="menuitem" onClick={() => setOpen(false)}>
            <UserCog size={16} /> Account &amp; security
          </Link>
          <a href="/" target="_blank" rel="noreferrer" role="menuitem">
            <ExternalLink size={16} /> View shop
          </a>
          <button onClick={onLogout} role="menuitem" className="danger">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

/** Bell: payments waiting for verification, newest first. */
function Notifications({ pending }) {
  const { open, setOpen, ref } = usePopover()
  const [items, setItems] = useState(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    adminApi
      .payments({ status: 'verification', limit: 6 })
      .then((r) => alive && setItems(r.data))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [open])

  return (
    <div className="notif" ref={ref}>
      <button
        className="tb-icon"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={pending ? `${pending} payment${pending === 1 ? '' : 's'} waiting for verification` : 'Notifications'}
      >
        <Bell size={19} />
        {pending > 0 && <span className="tb-dot">{pending > 9 ? '9+' : pending}</span>}
      </button>
      {open && (
        <div className="notif-pop" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Needs your attention</strong>
            <span className="small muted">{pending ? `${pending} to verify` : 'All clear'}</span>
          </div>
          {items === null ? (
            <p className="notif-empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="notif-empty">
              <CheckCircle2 size={22} /> No payments waiting. Nice work.
            </p>
          ) : (
            <ul className="notif-list">
              {items.map((p) => (
                <li key={p.id}>
                  <Link to={`/admin/orders/${p.order_id}`} onClick={() => setOpen(false)}>
                    <span className="notif-icon">
                      <CreditCard size={16} />
                    </span>
                    <span className="notif-text">
                      <strong>
                        {p.order_number} · {formatRWF(p.amount_rwf || p.order_total_rwf)}
                      </strong>
                      <small>
                        {p.customer_name} · {humanize(p.method)} · ref {p.transaction_ref || '—'}
                      </small>
                    </span>
                    <span className="notif-time">{timeAgo(p.updated_at || p.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/admin/payments" className="notif-all" onClick={() => setOpen(false)}>
            Open payments <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </div>
  )
}

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [searchOpen, setSearchOpen] = useState(false)
  const [pending, setPending] = useState(0)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  // Ctrl/⌘ + K (or "/") opens global search from anywhere in the admin.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setSearchOpen((v) => !v)
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const role = user?.role
  const canSeePayments = canAccess(role, ROLE_GROUPS.PAYMENTS)
  const canOrder = canAccess(role, ROLE_GROUPS.ORDERS)

  // Badge: payments waiting for verification.
  useEffect(() => {
    if (!canSeePayments) return undefined
    let alive = true
    const load = () =>
      adminApi
        .payments({ status: 'verification', limit: 1 })
        .then((r) => alive && setPending(r.pagination?.total || 0))
        .catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [location.pathname, canSeePayments])

  const [title, sub] = pageTitle(location.pathname)
  useEffect(() => {
    document.title = `${title} | Admin | Ubw'iwacu Honey`
  }, [title])

  const links = visibleLinks(role)
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className={`admin admin--v2 ${collapsed ? 'is-collapsed' : ''}`}>
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sb ${open ? 'open' : ''}`}>
        <div className="sb-brand">
          {collapsed ? (
            <Link to={adminHome(role)} className="logo" aria-label="Admin home">
              <LogoMark />
            </Link>
          ) : (
            <Logo to={adminHome(role)} small="Admin" />
          )}
          <button className="sb-close" onClick={() => setOpen(false)} aria-label="Close navigation">
            <X size={20} />
          </button>
        </div>

        <button className="sb-search" onClick={() => setSearchOpen(true)} title="Search (Ctrl K)">
          <Search size={17} />
          <span className="nav-label">Search…</span>
          <kbd className="nav-label">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>

        <nav className="sb-nav" aria-label="Admin">
          {links.map((l) =>
            l.group ? (
              <div key={l.group} className="sb-group">
                <span>{l.group}</span>
              </div>
            ) : (
              <NavLink key={l.to} to={l.to} end={l.end} title={collapsed ? l.label : undefined}>
                <span className="sb-icon">
                  <l.icon size={18} />
                </span>
                <span className="nav-label">{l.label}</span>
                {l.badge && pending > 0 && <span className="sb-count">{pending}</span>}
              </NavLink>
            ),
          )}
        </nav>

        <div className="sb-foot">
          {canSeePayments && pending > 0 && (
            <Link to="/admin/payments" className="sb-alert" title={collapsed ? `${pending} to verify` : undefined}>
              <span className="sb-alert-num">{pending}</span>
              <span className="nav-label">
                <strong>Payment{pending === 1 ? '' : 's'} to verify</strong>
                <small>Confirm so orders can be prepared</small>
              </span>
            </Link>
          )}
          <a className="sb-shop" href="/" target="_blank" rel="noreferrer" title={collapsed ? 'View shop' : undefined}>
            <ExternalLink size={16} />
            <span className="nav-label">View the shop</span>
          </a>
          <div className="sb-user">
            <span className="avatar">{(user?.name || 'A').slice(0, 1).toUpperCase()}</span>
            <span className="nav-label sb-user-text">
              <strong>{user?.name}</strong>
              <small>{role}</small>
            </span>
            <button className="sb-logout" onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
          <button className="sb-collapse" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <ChevronsLeft size={17} />
            <span className="nav-label">Collapse</span>
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="tb">
          <button className="tb-icon tb-menu" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={21} />
          </button>
          <div className="tb-title">
            <div className="tb-crumb">
              <span>{hello}, {(user?.name || '').split(' ')[0]}</span>
              <ChevronRight size={13} />
              <span>{title}</span>
              {sub && (
                <>
                  <ChevronRight size={13} />
                  <span>{sub}</span>
                </>
              )}
            </div>
            <h2>{sub || title}</h2>
          </div>

          <button className="tb-search" onClick={() => setSearchOpen(true)}>
            <Search size={17} />
            <span>{canOrder ? 'Search orders, customers, products…' : 'Search pages…'}</span>
            <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>

          <div className="tb-actions">
            <button className="tb-icon tb-search-mobile" onClick={() => setSearchOpen(true)} aria-label="Search">
              <Search size={19} />
            </button>
            {canSeePayments && <Notifications pending={pending} />}
            {canOrder && (
              <Link to="/admin/orders/new" className="btn btn--primary btn--sm tb-new">
                <Plus size={16} /> <span>New order</span>
              </Link>
            )}
            <UserMenu user={user} onLogout={logout} />
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>

        <footer className="admin-foot">
          <span>
            © {new Date().getFullYear()} {SITE.name} · {SITE.parent}
          </span>
          <span className="admin-foot-links">
            <span className="admin-foot-note">{SITE.slogan}</span>
            <a href="/" target="_blank" rel="noreferrer">
              Shop
            </a>
            <a href={`mailto:${SITE.email}`}>Support</a>
          </span>
        </footer>
      </div>

      {searchOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            pages={links.filter((l) => !l.group)}
            canSearch={canOrder}
            canOrder={canOrder}
            onClose={closeSearch}
          />
        </Suspense>
      )}
    </div>
  )
}

// Icon + section label for each page heading (matched by title, so every page gets one).
const HEAD_META = {
  Orders: [ClipboardList, 'Sales'],
  'Manual order': [Plus, 'Sales'],
  Payments: [CreditCard, 'Sales'],
  Receipts: [Receipt, 'Sales'],
  'Point of Sale': [Monitor, 'Sales'],
  Customers: [Users, 'Sales'],
  'Products & stock': [Package, 'Catalogue'],
  'Reports & analytics': [BarChart3, 'Insights'],
  Reports: [BarChart3, 'Insights'],
  'Audit log': [ScrollText, 'Insights'],
  'Account & security': [UserCog, 'You'],
}

export function PageHead({ title, subtitle, actions, icon, eyebrow }) {
  const [Icon, section] = HEAD_META[title] || [icon, eyebrow]
  const HeadIcon = icon || Icon
  return (
    <div className="admin-head admin-head--v2">
      <div className="admin-head-main">
        {HeadIcon && (
          <span className="admin-head-icon" aria-hidden="true">
            <HeadIcon size={22} />
          </span>
        )}
        <div>
          {(eyebrow || section) && <span className="admin-head-eyebrow">{eyebrow || section}</span>}
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="row admin-head-actions">{actions}</div>}
    </div>
  )
}
