import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header.jsx'
import Footer from './Footer.jsx'
import CartDrawer from './CartDrawer.jsx'
import { WhatsAppIcon } from '../Brand.jsx'
import { waLink } from '../../lib/format.js'

export default function SiteLayout() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main" style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
      <a
        className="wa-float"
        href={waLink("Hello Ubw'iwacu Honey. I have a question.")}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat with us on WhatsApp"
      >
        <WhatsAppIcon size={30} />
      </a>
    </div>
  )
}
