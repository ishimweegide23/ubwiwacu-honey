import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Clock, LogIn, Menu, PackageCheck, Phone, Search, ShoppingBag, Truck, X } from 'lucide-react'
import { Logo, WhatsAppIcon } from '../Brand.jsx'
import { useCart } from '../../context/CartContext.jsx'
import { NAV, SITE } from '../../config/site.js'
import { PHOTOS } from '../../config/photos.js'
import { waLink } from '../../lib/format.js'

const QUICK = [
  { label: '350 g', to: '/shop?size=350g' },
  { label: '500 g', to: '/shop?size=500g' },
  { label: '1 kg', to: '/shop?size=1kg' },
  { label: '5 kg', to: '/shop?size=5kg' },
  { label: '7 kg', to: '/shop?size=7kg' },
  { label: 'Premium', to: '/shop?category=premium' },
]
const WA_HELLO = "Hello Ubw'iwacu Honey. I would like to place an order."

export default function Header() {
  const { count, openDrawer } = useCart()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    setSearchOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!searchOpen && !menuOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen, menuOpen])

  const submitSearch = (e) => {
    e.preventDefault()
    navigate(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : '/shop')
    setSearchOpen(false)
  }

  return (
    <>
      <div className="announce">
        <div className="container announce-inner">
          <span className="announce-item">
            <Truck size={14} /> Delivery is arranged and paid for by the customer
          </span>
          <span className="announce-item announce-item--hide">
            <Clock size={14} /> {SITE.orderingHours}
          </span>
          <a className="announce-item announce-item--hide" href={`tel:${SITE.phone}`}>
            <Phone size={14} /> {SITE.phoneDisplay}
          </a>
        </div>
      </div>
      <header className={`header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="container header-inner">
          <Logo />
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            <button className={`icon-btn ${searchOpen ? 'is-on' : ''}`} onClick={() => setSearchOpen((v) => !v)} aria-label="Search products" aria-expanded={searchOpen}>
              {searchOpen ? <X size={20} /> : <Search size={20} />}
            </button>
            <Link to="/track" className="icon-btn header-track" aria-label="Track your order" title="Track order">
              <PackageCheck size={20} />
            </Link>
            <Link to="/admin/login" className="signin-btn" title="Staff sign in">
              <LogIn size={18} />
              <span>Sign in</span>
            </Link>
            <button className="cart-btn" onClick={openDrawer} aria-label={`Open cart, ${count} item${count === 1 ? '' : 's'}`}>
              <ShoppingBag size={19} />
              <span className="cart-btn-label">Cart</span>
              <span className={`cart-count ${count > 0 ? 'is-full' : ''}`}>{count > 99 ? '99+' : count}</span>
            </button>
            <button className="icon-btn menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
          </div>
        </div>
        <div className="header-drip" aria-hidden="true" />
        {searchOpen && (
          <div className="search-panel">
            <form className="container search-form" onSubmit={submitSearch} role="search">
              <label htmlFor="site-search" className="sr-only">
                Search honey products
              </label>
              <div className="search-field">
                <Search size={20} />
                <input id="site-search" placeholder="Search honey, e.g. 1 kg, premium, gift…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
                <button className="btn btn--primary btn--sm" type="submit">
                  Search
                </button>
              </div>
              <div className="search-quick">
                <span>Popular:</span>
                {QUICK.map((c) => (
                  <Link key={c.to} to={c.to} className="chip">
                    {c.label}
                  </Link>
                ))}
              </div>
            </form>
          </div>
        )}
      </header>
      {searchOpen && <div className="search-backdrop" onClick={() => setSearchOpen(false)} />}

      {menuOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <aside className="drawer drawer--menu" aria-label="Menu">
            <div className="drawer-head">
              <Logo onClick={() => setMenuOpen(false)} />
              <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X size={22} />
              </button>
            </div>
            <div className="drawer-body">
              <nav className="mobile-nav" aria-label="Mobile">
                {[...NAV, { to: '/track', label: 'Track your order' }, { to: '/faq', label: 'FAQ' }].map((n, i) => (
                  <NavLink key={n.to} to={n.to} end={n.to === '/'}>
                    <span className="mobile-nav-num">{String(i + 1).padStart(2, '0')}</span>
                    {n.label}
                    <ArrowRight size={18} />
                  </NavLink>
                ))}
              </nav>
              <Link to="/shop" className="menu-promo" style={{ '--bg': `url(${PHOTOS.g500Highlands})` }}>
                <span className="eyebrow eyebrow--light">The full range</span>
                <strong>350 g to 7 kg, for homes and businesses</strong>
                <span className="menu-promo-cta">
                  Shop honey <ArrowRight size={16} />
                </span>
              </Link>
            </div>
            <div className="drawer-foot stack">
              <a className="btn btn--whatsapp btn--block" href={waLink(WA_HELLO)} target="_blank" rel="noreferrer">
                <WhatsAppIcon size={18} /> Order on WhatsApp
              </a>
              <div className="row" style={{ gap: 10 }}>
                <a className="btn btn--outline" style={{ flex: 1 }} href={`tel:${SITE.phone}`}>
                  <Phone size={17} /> Call
                </a>
                <Link className="btn btn--outline" style={{ flex: 1 }} to="/admin/login">
                  <LogIn size={17} /> Staff sign in
                </Link>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
