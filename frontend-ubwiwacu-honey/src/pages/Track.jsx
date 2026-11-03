import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, CreditCard, Download, MessageCircle, PackageCheck, Search, Truck } from 'lucide-react'
import { WhatsAppIcon } from '../components/Brand.jsx'
import { usePageMeta } from '../lib/useAsync.js'
import { waLink } from '../lib/format.js'
import { PHOTOS } from '../config/photos.js'

const FORMAT = /^UBH-\d{4}-\d{4,}$/

const WHAT_YOU_SEE = [
  { icon: CheckCircle2, title: 'Live progress', text: 'From order received to completed, with dates.' },
  { icon: CreditCard, title: 'Send your payment reference', text: 'Paste the ID from your MoMo, Airtel or bank message.' },
  { icon: Download, title: 'Download your receipt', text: 'As soon as our team verifies your payment.' },
  { icon: Truck, title: 'Delivery or collection details', text: 'Exactly where and to whom your honey goes.' },
]

/** Order numbers placed in this browser (checkout stores the phone under ubh_phone_<number>). */
function recentOrders() {
  try {
    return Object.keys(sessionStorage)
      .filter((k) => k.startsWith('ubh_phone_'))
      .map((k) => k.replace('ubh_phone_', ''))
      .filter((n) => FORMAT.test(n))
      .slice(-4)
      .reverse()
  } catch {
    return []
  }
}

export default function Track() {
  usePageMeta('Track Your Order', "Track your Ubw'iwacu Honey order with your order number.")
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [recent] = useState(recentOrders)

  const submit = (e) => {
    e.preventDefault()
    let n = value.trim().toUpperCase().replace(/\s+/g, '')
    // Accept "2026-0001" or "UBH20260001" too.
    if (/^\d{4}-\d{4,}$/.test(n)) n = `UBH-${n}`
    if (/^UBH\d{8,}$/.test(n)) n = `UBH-${n.slice(3, 7)}-${n.slice(7)}`
    if (!FORMAT.test(n)) {
      setError('Order numbers look like UBH-2026-0001')
      return
    }
    navigate(`/order/${n}`)
  }

  return (
    <div className="trk">
      <section className="trk-hero">
        <div className="container trk-grid">
          <div className="trk-main">
            <span className="trk-icon" aria-hidden="true">
              <PackageCheck size={28} />
            </span>
            <span className="eyebrow eyebrow--light">Order tracking</span>
            <h1>
              Where is my <em>honey?</em>
            </h1>
            <p>Enter the order number you received when you ordered. It is in your confirmation and starts with UBH.</p>

            <form onSubmit={submit} noValidate className="trk-form">
              <label htmlFor="trk-input" className="sr-only">
                Order number
              </label>
              <div className={`trk-field ${error ? 'is-error' : ''}`}>
                <Search size={20} />
                <input
                  id="trk-input"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value)
                    setError('')
                  }}
                  placeholder="UBH-2026-0001"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby="trk-help"
                  autoFocus
                />
                <button className="btn btn--primary">
                  Track <ArrowRight size={17} />
                </button>
              </div>
              <p id="trk-help" className={error ? 'trk-error' : 'trk-help'} role={error ? 'alert' : undefined}>
                {error || 'Example: UBH-2026-0001'}
              </p>
            </form>

            {recent.length > 0 && (
              <div className="trk-recent">
                <span>Your recent orders on this device:</span>
                {recent.map((n) => (
                  <Link key={n} to={`/order/${n}`} className="trk-chip">
                    {n} <ArrowRight size={13} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="trk-side">
            <div className="trk-photo" style={{ '--bg': `url(${PHOTOS.kg1Street})` }} aria-hidden="true" />
            <div className="trk-card">
              <strong>On your order page you can</strong>
              <ul>
                {WHAT_YOU_SEE.map(({ icon: Icon, title, text }) => (
                  <li key={title}>
                    <span className="hex-icon">
                      <Icon size={18} />
                    </span>
                    <span>
                      <b>{title}</b>
                      <small>{text}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section--tight">
        <div className="container">
          <div className="trk-help-band">
            <span className="hex-icon">
              <MessageCircle size={20} />
            </span>
            <div>
              <strong>Lost your order number?</strong>
              <p>Send us your name and phone number on WhatsApp and we will find your order.</p>
            </div>
            <a className="btn btn--whatsapp" href={waLink("Hello Ubw'iwacu Honey. I lost my order number. My name is … and my phone is …")} target="_blank" rel="noreferrer">
              <WhatsAppIcon size={18} /> Ask on WhatsApp
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
