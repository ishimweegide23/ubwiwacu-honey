import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Clock, HelpCircle, Mail, MapPin, Phone, Send } from 'lucide-react'
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from '../components/Brand.jsx'
import { Field, Notice } from '../components/ui.jsx'
import { usePageMeta } from '../lib/useAsync.js'
import { PHOTOS } from '../config/photos.js'
import { isValidEmail, isValidPhone, waLink } from '../lib/format.js'
import { SITE } from '../config/site.js'

const CHANNELS = [
  { icon: WhatsAppIcon, title: 'WhatsApp', value: SITE.phoneDisplay, note: 'Fastest reply', href: waLink(), external: true, tone: 'wa' },
  { icon: Phone, title: 'Call us', value: SITE.phoneDisplay, note: SITE.orderingHours, href: `tel:${SITE.phone}`, tone: 'honey' },
  { icon: Mail, title: 'Email', value: SITE.email, note: 'For quotes & documents', href: `mailto:${SITE.email}`, tone: 'plum' },
  { icon: InstagramIcon, title: 'Instagram', value: SITE.instagram.handle, note: 'Photos & news', href: SITE.instagram.url, external: true, tone: 'ig' },
  { icon: TikTokIcon, title: 'TikTok', value: SITE.tiktok.handle, note: 'Short videos', href: SITE.tiktok.url, external: true, tone: 'dark' },
]

const TOPICS = ['Question about an order', 'Payment', 'Delivery', 'Business supply', 'Feedback', 'Something else']

export default function Contact() {
  usePageMeta('Contact Us', "Contact Ubw'iwacu Honey by phone, WhatsApp or email.")
  const [form, setForm] = useState({ name: '', phone: '', email: '', subject: '', message: '' })
  const [errors, setErrors] = useState({})
  const [ready, setReady] = useState(false)
  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value })
    setErrors({ ...errors, [k]: undefined })
    setReady(false)
  }
  const pickTopic = (t) => {
    setForm((f) => ({ ...f, subject: f.subject === t ? '' : t }))
    setReady(false)
  }

  const submit = (e) => {
    e.preventDefault()
    const er = {}
    if (!form.name.trim()) er.name = 'Please enter your name'
    if (!form.phone.trim() && !form.email.trim()) er.phone = 'Give us a phone number or email so we can reply'
    if (form.phone && !isValidPhone(form.phone)) er.phone = 'Enter a valid phone number'
    if (form.email && !isValidEmail(form.email)) er.email = 'Enter a valid email'
    if (form.message.trim().length < 5) er.message = 'Please write your message'
    setErrors(er)
    if (!Object.keys(er).length) setReady(true)
  }

  const text = `Hello Ubw'iwacu Honey.${form.subject ? `\nTopic: ${form.subject}` : ''}\n\n${form.message}\n\nName: ${form.name}\nPhone: ${form.phone || '-'}\nEmail: ${form.email || '-'}`

  return (
    <div className="ct-page">
      <section className="ct-hero" style={{ '--bg': `url(${PHOTOS.mixStack})` }}>
        <div className="container ct-hero-inner">
          <span className="eyebrow eyebrow--light">Contact</span>
          <h1>
            We’d love to <em>hear from you.</em>
          </h1>
          <p>Questions about our honey, your order or a business supply? Talk to a real person. We reply as soon as we can.</p>
        </div>
      </section>

      <div className="container ct-channels-wrap">
        <div className="ct-channels">
          {CHANNELS.map(({ icon: Icon, title, value, note, href, external, tone }) => (
            <a key={title} className={`ct-channel ct-channel--${tone}`} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
              <span className="ct-channel-icon">
                <Icon size={20} />
              </span>
              <strong>{title}</strong>
              <span className="ct-channel-value">{value}</span>
              <small>{note}</small>
              <ArrowUpRight size={16} className="ct-go" />
            </a>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="container ct-grid">
          <form className="ct-form" onSubmit={submit} noValidate>
            <h2>Send us a message</h2>
            <p className="muted">Pick a topic, write your message, then send it by WhatsApp or email.</p>
            <div className="ct-topics" role="group" aria-label="Topic">
              {TOPICS.map((t) => (
                <button type="button" key={t} className="chip" aria-pressed={form.subject === t} onClick={() => pickTopic(t)}>
                  {t}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Your name" required error={errors.name} className="full">
                {(p) => <input {...p} className="input" autoComplete="name" value={form.name} onChange={set('name')} />}
              </Field>
              <Field label="Phone" error={errors.phone}>
                {(p) => <input {...p} className="input" type="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={form.phone} onChange={set('phone')} />}
              </Field>
              <Field label="Email" error={errors.email}>
                {(p) => <input {...p} className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} />}
              </Field>
              <Field label="Subject" className="full">
                {(p) => <input {...p} className="input" value={form.subject} onChange={set('subject')} placeholder="Or type your own" />}
              </Field>
              <Field label="Message" required error={errors.message} className="full">
                {(p) => <textarea {...p} className="textarea" value={form.message} onChange={set('message')} placeholder="How can we help?" />}
              </Field>
            </div>
            {!ready ? (
              <button className="btn btn--primary btn--lg btn--block" style={{ marginTop: 20 }}>
                <Send size={17} /> Prepare message
              </button>
            ) : (
              <div className="stack" style={{ marginTop: 20, gap: 10 }}>
                <Notice variant="success">Your message is ready. Choose how to send it:</Notice>
                <a className="btn btn--whatsapp btn--lg btn--block" href={waLink(text)} target="_blank" rel="noreferrer">
                  <WhatsAppIcon size={18} /> Send via WhatsApp
                </a>
                <a
                  className="btn btn--outline btn--block"
                  href={`mailto:${SITE.email}?subject=${encodeURIComponent(form.subject || 'Website enquiry')}&body=${encodeURIComponent(text)}`}
                >
                  <Mail size={17} /> Send via email
                </a>
              </div>
            )}
          </form>

          <aside className="ct-aside">
            <div className="ct-hours">
              <span className="hex-icon">
                <Clock size={20} />
              </span>
              <div>
                <strong>Opening hours</strong>
                <p>{SITE.orderingHours}. Send a message any time and we reply as soon as we can.</p>
              </div>
            </div>
            <div className="ct-where">
              <img src={PHOTOS.g500Highlands} alt="Ubw’iwacu Honey jars in the Rwandan hills" loading="lazy" />
              <div>
                <strong>
                  <MapPin size={16} /> Rwanda
                </strong>
                <p>We deliver anywhere you can arrange a rider, or you can collect. A brand of {SITE.parent}.</p>
              </div>
            </div>
            <Link to="/faq" className="faq-link">
              <HelpCircle size={18} /> Read the FAQ first <ArrowRight size={15} />
            </Link>
            <Link to="/business" className="faq-link">
              <ArrowUpRight size={18} /> Business supply &amp; quotes <ArrowRight size={15} />
            </Link>
          </aside>
        </div>
      </section>
    </div>
  )
}
