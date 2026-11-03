import { Link } from 'react-router-dom'
import { ArrowRight, Clock, LogIn, Mail, MapPin, Phone, ShieldCheck, Smartphone, Building } from 'lucide-react'
import { InstagramIcon, Logo, TikTokIcon, WhatsAppIcon } from '../Brand.jsx'
import { SITE } from '../../config/site.js'
import { PHOTOS } from '../../config/photos.js'
import { waLink } from '../../lib/format.js'

const PRODUCT_LINKS = [
  { slug: 'ubwiwacu-honey-350g', label: 'Honey 350 g' },
  { slug: 'ubwiwacu-honey-500g', label: 'Honey 500 g' },
  { slug: 'ubwiwacu-honey-1kg', label: 'Honey 1 kg' },
  { slug: 'ubwiwacu-honey-5kg', label: 'Honey 5 kg' },
  { slug: 'ubwiwacu-honey-7kg', label: 'Honey 7 kg' },
  { slug: 'ubwiwacu-premium-honey-1kg', label: 'Premium 1 kg' },
]

const HELP_LINKS = [
  { to: '/track', label: 'Track your order' },
  { to: '/faq', label: 'FAQ' },
  { to: '/policies/delivery-returns', label: 'Delivery & refunds' },
  { to: '/policies/privacy', label: 'Privacy policy' },
  { to: '/policies/terms', label: 'Terms & conditions' },
]

const COMPANY_LINKS = [
  { to: '/our-story', label: 'Our story' },
  { to: '/business', label: 'Business & wholesale' },
  { to: '/contact', label: 'Contact us' },
]

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-comb" aria-hidden="true" />
      <div className="container">
        <div className="footer-cta" style={{ '--bg': `url(${PHOTOS.kg1Pyramid})` }}>
          <div>
            <h3>Questions about an order or bulk supply?</h3>
            <p>Talk to a real person on WhatsApp. We reply from {SITE.orderingHours.replace('Ordering from ', '')}.</p>
          </div>
          <div className="row">
            <a className="btn btn--whatsapp" href={waLink()} target="_blank" rel="noreferrer">
              <WhatsAppIcon size={18} /> Chat on WhatsApp
            </a>
            <a className="btn btn--glass" href={`tel:${SITE.phone}`}>
              <Phone size={17} /> {SITE.phoneDisplay}
            </a>
          </div>
        </div>

        <div className="footer-grid">
          <div className="footer-brand">
            <Logo />
            <p className="footer-slogan">{SITE.slogan}</p>
            <p>
              A Rwandan honey brand bringing the sweetness of nature to homes and businesses, through relationships
              with farmers and beekeepers. Part of {SITE.parent}.
            </p>
            <div className="footer-social">
              <a href={SITE.instagram.url} target="_blank" rel="noreferrer" aria-label="Instagram">
                <InstagramIcon size={18} />
              </a>
              <a href={SITE.tiktok.url} target="_blank" rel="noreferrer" aria-label="TikTok">
                <TikTokIcon size={18} />
              </a>
              <a href={waLink()} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                <WhatsAppIcon size={18} />
              </a>
            </div>
          </div>
          <nav aria-label="Shop">
            <h4>Shop</h4>
            <ul>
              {PRODUCT_LINKS.map((p) => (
                <li key={p.slug}>
                  <Link to={`/shop/${p.slug}`}>{p.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Company">
            <h4>Company</h4>
            <ul>
              {COMPANY_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to}>{l.label}</Link>
                </li>
              ))}
            </ul>
            <h4 style={{ marginTop: 22 }}>Help</h4>
            <ul>
              {HELP_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <h4>Contact</h4>
            <ul className="footer-contact">
              <li>
                <Phone size={16} /> <a href={`tel:${SITE.phone}`}>{SITE.phoneDisplay}</a>
              </li>
              <li>
                <Mail size={16} /> <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </li>
              <li>
                <Clock size={16} /> {SITE.orderingHours}
              </li>
              <li>
                <MapPin size={16} /> Rwanda · delivery anywhere you can arrange a rider
              </li>
            </ul>
            <h4 style={{ marginTop: 22 }}>We accept</h4>
            <div className="footer-pay">
              <span className="pay-chip pay-chip--mtn">
                <Smartphone size={14} /> MTN MoMo
              </span>
              <span className="pay-chip pay-chip--airtel">
                <Smartphone size={14} /> Airtel Money
              </span>
              <span className="pay-chip">
                <Building size={14} /> Bank
              </span>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {SITE.name} · {SITE.parent}. All rights reserved.
          </span>
          <span className="footer-bottom-links">
            <span>
              <ShieldCheck size={14} /> We never ask for your PIN
            </span>
            <Link to="/admin/login">
              <LogIn size={14} /> Staff sign in
            </Link>
            <Link to="/shop">
              Shop <ArrowRight size={14} />
            </Link>
          </span>
        </div>
      </div>
    </footer>
  )
}
