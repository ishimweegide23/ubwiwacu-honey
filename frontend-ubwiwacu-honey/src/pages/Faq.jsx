import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, CreditCard, HelpCircle, Mail, Package, PackageCheck, Phone, Receipt, Search, ShoppingBag, Truck, X } from 'lucide-react'
import { WhatsAppIcon } from '../components/Brand.jsx'
import { usePageMeta } from '../lib/useAsync.js'
import { waLink } from '../lib/format.js'
import { PHOTOS } from '../config/photos.js'
import { DELIVERY_NOTICE, PAYMENT_SAFETY, SITE } from '../config/site.js'

const FAQ = [
  {
    group: 'Products & prices',
    items: [
      {
        q: 'Which package sizes do you offer?',
        a: 'Ubw’iwacu Honey comes in 350 g (2,500 RWF), 500 g (4,500 RWF), 1 kg (9,000 RWF), 5 kg (45,000 RWF) and 7 kg (63,000 RWF). We also offer Ubw’iwacu Premium Honey 1 kg (16,000 RWF).',
      },
      {
        q: 'What is the difference between the standard 1 kg and the Premium 1 kg?',
        a: 'They are two separate products. The Premium package offers a more elevated presentation, designed for gifting and special occasions.',
      },
      { q: 'Are prices fixed?', a: 'Yes. Prices shown on the website are our official prices in Rwandan Francs. Our system always calculates your total from these prices.' },
    ],
  },
  {
    group: 'Ordering',
    items: [
      { q: 'Do I need an account to order?', a: 'No. You can order as a guest with your name and phone number. An email is optional but helps you receive your receipt.' },
      { q: 'Can I order on WhatsApp?', a: `Yes. Use any “Order on WhatsApp” button or message us on ${SITE.phoneDisplay}. Our team will confirm availability and payment instructions.` },
      { q: 'What are your ordering hours?', a: `${SITE.orderingHours}.` },
      { q: 'How do I track my order?', a: 'Use the Track Order page and enter your order number (e.g. UBH-2026-0001). You will see your payment and fulfilment status.' },
    ],
  },
  {
    group: 'Payment',
    items: [
      {
        q: 'How do I pay?',
        a: 'After placing your order you receive payment instructions. Once you have paid, submit your transaction reference on your order page. Our team verifies the payment and then confirms your order.',
      },
      { q: 'Is my order paid as soon as I submit the reference?', a: 'No. Your payment is marked as paid only after our team has checked it against the funds actually received.' },
      { q: 'Will you ask for my PIN?', a: PAYMENT_SAFETY },
    ],
  },
  {
    group: 'Delivery',
    items: [
      { q: 'Do you charge for delivery?', a: DELIVERY_NOTICE },
      { q: 'Can I collect my order?', a: 'You can choose collection at checkout. We will contact you to confirm when and where your order is ready.' },
    ],
  },
  {
    group: 'Receipts & feedback',
    items: [
      {
        q: 'When do I receive a receipt?',
        a: 'A payment receipt is issued once your payment is verified. You can download it from your order page using your phone number, and we email it if you gave us an email address.',
      },
      { q: 'Can I share feedback?', a: 'Yes, we welcome feedback after you have received your order. We only publish genuine reviews, with your permission.' },
    ],
  },
]

const GROUP_ICON = {
  'Products & prices': Package,
  Ordering: ShoppingBag,
  Payment: CreditCard,
  Delivery: Truck,
  'Receipts & feedback': Receipt,
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function Faq() {
  usePageMeta('Frequently Asked Questions', "Answers about Ubw'iwacu Honey sizes, prices, ordering, payment, delivery and receipts.")
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const term = norm(q.trim())

  const groups = FAQ.filter((g) => !group || g.group === group)
    .map((g) => ({ ...g, items: g.items.filter((it) => !term || norm(`${it.q} ${it.a}`).includes(term)) }))
    .filter((g) => g.items.length)
  const found = groups.reduce((n, g) => n + g.items.length, 0)
  const total = FAQ.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="faq-page">
      <section className="faq-hero">
        <div className="container faq-hero-inner">
          <span className="eyebrow eyebrow--light">Help centre</span>
          <h1>
            How can we <em>help?</em>
          </h1>
          <p>Answers about sizes, prices, ordering, payment, delivery and receipts.</p>
          <label className="faq-search">
            <Search size={20} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: delivery, receipt, PIN, 5 kg…" aria-label="Search questions" />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </label>
          <div className="faq-cats" role="group" aria-label="Topics">
            <button aria-pressed={!group} onClick={() => setGroup('')}>
              All topics
            </button>
            {FAQ.map((g) => {
              const Icon = GROUP_ICON[g.group] || HelpCircle
              return (
                <button key={g.group} aria-pressed={group === g.group} onClick={() => setGroup(group === g.group ? '' : g.group)}>
                  <Icon size={15} /> {g.group}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container faq-layout">
          <div>
            <p className="faq-count">{term || group ? `${found} of ${total} answers` : `${total} answers`}</p>
            {groups.length === 0 && (
              <div className="faq-empty">
                <HelpCircle size={30} />
                <strong>No answer matches “{q}”</strong>
                <span>Try another word, or ask us directly. We are happy to help.</span>
              </div>
            )}
            {groups.map((g) => {
              const Icon = GROUP_ICON[g.group] || HelpCircle
              return (
                <div key={g.group} className="faq-group">
                  <h2>
                    <span className="hex-icon">
                      <Icon size={18} />
                    </span>
                    {g.group}
                  </h2>
                  <div className="faq-list">
                    {g.items.map((it) => (
                      <details key={it.q} className="faq-item" open={Boolean(term)}>
                        <summary>
                          <span>{it.q}</span>
                          <ChevronDown size={20} />
                        </summary>
                        <div className="faq-answer">{it.a}</div>
                      </details>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <aside className="faq-aside">
            <div className="faq-help">
              <img src={PHOTOS.mixStack} alt="" loading="lazy" />
              <div>
                <strong>Still have a question?</strong>
                <p>Talk to a real person. We reply from {SITE.orderingHours.replace('Ordering from ', '')}.</p>
                <a className="btn btn--whatsapp btn--block" href={waLink("Hello Ubw'iwacu Honey. I have a question.")} target="_blank" rel="noreferrer">
                  <WhatsAppIcon size={18} /> WhatsApp us
                </a>
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <a className="btn btn--outline btn--sm" style={{ flex: 1 }} href={`tel:${SITE.phone}`}>
                    <Phone size={15} /> Call
                  </a>
                  <Link className="btn btn--outline btn--sm" style={{ flex: 1 }} to="/contact">
                    <Mail size={15} /> Message
                  </Link>
                </div>
              </div>
            </div>
            <Link to="/track" className="faq-link">
              <PackageCheck size={18} /> Track an order <ArrowRight size={15} />
            </Link>
            <Link to="/policies/delivery-returns" className="faq-link">
              <Truck size={18} /> Delivery &amp; refund policy <ArrowRight size={15} />
            </Link>
          </aside>
        </div>
      </section>
    </div>
  )
}
