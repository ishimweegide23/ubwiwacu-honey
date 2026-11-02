import { useState } from 'react'
import { ArrowRight, Building2, CheckCircle2, Coffee, FileText, Handshake, Hotel, Info, Landmark, Mail, MessageCircle, Phone, ShoppingBasket, Truck, UtensilsCrossed } from 'lucide-react'
import { WhatsAppIcon } from '../components/Brand.jsx'
import { Field, Notice } from '../components/ui.jsx'
import { usePageMeta } from '../lib/useAsync.js'
import { PHOTOS } from '../config/photos.js'
import { isValidEmail, isValidPhone, waLink } from '../lib/format.js'
import { SITE } from '../config/site.js'

const SEGMENTS = [
  { icon: Coffee, label: 'Cafés & coffee shops' },
  { icon: UtensilsCrossed, label: 'Restaurants' },
  { icon: ShoppingBasket, label: 'Retailers & grocers' },
  { icon: Hotel, label: 'Hotels & hospitality' },
  { icon: Landmark, label: 'Institutions' },
  { icon: Building2, label: 'Other businesses' },
]
const CATEGORIES = ['Café / coffee shop', 'Restaurant', 'Retail / grocery shop', 'Hotel / hospitality', 'Institution / organisation', 'Distributor', 'Other']
const SIZES = ['350 g', '500 g', '1 kg', '5 kg', '7 kg', 'Premium 1 kg']
const STEPS = [
  { icon: FileText, title: 'Send your enquiry', text: 'Tell us your business, sizes and how much honey you use.' },
  { icon: MessageCircle, title: 'We talk it through', text: 'Our team contacts you to understand your needs.' },
  { icon: Handshake, title: 'Quote confirmed', text: 'You receive a quotation prepared for your business.' },
  { icon: Truck, title: 'Regular supply', text: 'Order when you need it; delivery arranged with you.' },
]
const BULK = [
  { size: '5 kg', price: '45,000 RWF', text: 'Cafés and busy homes', photo: PHOTOS.kg5Backdrop },
  { size: '7 kg', price: '63,000 RWF', text: 'Restaurants and kitchens', photo: PHOTOS.kg7Jug },
  { size: '1 kg', price: '9,000 RWF', text: 'Retail shelves', photo: PHOTOS.kg1Studio },
]
const FREQ = ['One-time order', 'Weekly', 'Every two weeks', 'Monthly', 'Not sure yet']

const EMPTY = {
  business_name: '',
  contact_name: '',
  email: '',
  phone: '',
  category: '',
  location: '',
  monthly_requirement: '',
  sizes: [],
  frequency: '',
  delivery: '',
  comments: '',
}

function buildMessage(f) {
  return [
    "Hello Ubw'iwacu Honey. Business supply enquiry:",
    '',
    `Business name: ${f.business_name}`,
    `Contact person: ${f.contact_name}`,
    `Email: ${f.email}`,
    `Phone: ${f.phone}`,
    `Business category: ${f.category}`,
    `Location: ${f.location}`,
    `Estimated monthly requirement: ${f.monthly_requirement}`,
    `Preferred package sizes: ${f.sizes.join(', ') || '-'}`,
    `Order frequency: ${f.frequency || '-'}`,
    `Delivery requirements: ${f.delivery || '-'}`,
    `Comments: ${f.comments || '-'}`,
  ].join('\n')
}

export default function Business() {
  usePageMeta('Business & Wholesale', "Partner with Ubw'iwacu Honey: bulk honey supply in Rwanda for cafés, restaurants, retailers, hotels and institutions.")
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [ready, setReady] = useState(false)

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value })
    setErrors({ ...errors, [k]: undefined })
    setReady(false)
  }
  const toggleSize = (s) => {
    setForm((f) => ({ ...f, sizes: f.sizes.includes(s) ? f.sizes.filter((x) => x !== s) : [...f.sizes, s] }))
    setReady(false)
  }

  const submit = (e) => {
    e.preventDefault()
    const er = {}
    if (!form.business_name.trim()) er.business_name = 'Required'
    if (!form.contact_name.trim()) er.contact_name = 'Required'
    if (!isValidEmail(form.email)) er.email = 'Enter a valid business email'
    if (!isValidPhone(form.phone)) er.phone = 'Enter a valid phone number'
    if (!form.category) er.category = 'Choose a category'
    if (!form.location.trim()) er.location = 'Required'
    if (!form.monthly_requirement.trim()) er.monthly_requirement = 'Give an estimate, e.g. 20 kg'
    setErrors(er)
    if (Object.keys(er).length) return
    setReady(true)
  }

  const message = buildMessage(form)

  return (
    <div className="biz-page">
      <section className="biz-hero">
        <div className="container biz-hero-grid">
          <div>
            <span className="eyebrow eyebrow--light">Business &amp; wholesale</span>
            <h1>
              Honey for kitchens <em>that never stop.</em>
            </h1>
            <p>
              Ubw’iwacu Honey supplies cafés, restaurants, retailers, hotels and institutions across Rwanda. Tell us what
              you need and we prepare a quote for your business.
            </p>
            <div className="row">
              <a href="#quote" className="btn btn--primary btn--lg">
                Request a quote <ArrowRight size={18} />
              </a>
              <a className="btn btn--glass btn--lg" href={waLink("Hello Ubw'iwacu Honey. I would like to discuss business supply.")} target="_blank" rel="noreferrer">
                <WhatsAppIcon size={18} /> Talk to us
              </a>
            </div>
          </div>
          <div className="biz-hero-art" aria-hidden="true">
            <img src={PHOTOS.kg7Jug} alt="" className="biz-hero-bg" />
            <img src={PHOTOS.kg5Studio} alt="" className="biz-hero-can biz-hero-can--a" />
            <img src={PHOTOS.kg7Studio} alt="" className="biz-hero-can biz-hero-can--b" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Who we supply</span>
            <h2>Built for businesses that use honey every day</h2>
            <p>Whether it is for drinks, food preparation, retail shelves or guests, we find an arrangement that fits.</p>
          </div>
          <div className="biz-segs">
            {SEGMENTS.map(({ icon: Icon, label }) => (
              <div key={label} className="biz-seg">
                <span className="hex-icon">
                  <Icon size={20} />
                </span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--paper">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>From enquiry to regular supply</h2>
          </div>
          <ol className="biz-steps">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title}>
                <span className="biz-step-num">{i + 1}</span>
                <span className="biz-step-icon">
                  <Icon size={22} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <div className="biz-sizes">
            {BULK.map((b) => (
              <div key={b.size} className="biz-size">
                <img src={b.photo} alt={`${b.size} package`} loading="lazy" />
                <div>
                  <strong>{b.size}</strong>
                  <span>{b.price}</span>
                  <small>{b.text}</small>
                </div>
              </div>
            ))}
            <div className="biz-size biz-size--note">
              <Info size={20} />
              <p>
                These are our published retail prices. A business quotation is prepared individually and confirmed by our
                team before it applies. We do not publish wholesale discounts or minimum order quantities.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="quote">
        <div className="container biz-quote">
          <div className="biz-quote-side">
            <span className="eyebrow">Request a quote</span>
            <h2>Tell us about your business</h2>
            <p>Fill in the form and send it to our team by WhatsApp or email. We reply to discuss your needs and a suitable arrangement.</p>
            <ul className="biz-checks">
              <li>
                <CheckCircle2 size={18} /> No commitment: it is just an enquiry
              </li>
              <li>
                <CheckCircle2 size={18} /> 350 g to 7 kg, and Premium for gifting
              </li>
              <li>
                <CheckCircle2 size={18} /> One-time or regular supply
              </li>
            </ul>
            <div className="biz-contact">
              <a href={`tel:${SITE.phone}`}>
                <Phone size={16} /> {SITE.phoneDisplay}
              </a>
              <a href={`mailto:${SITE.email}`}>
                <Mail size={16} /> {SITE.email}
              </a>
            </div>
          </div>

          <form className="ct-form" onSubmit={submit} noValidate>
            <h3 className="biz-form-h">
              <span>1</span> Your business
            </h3>
            <div className="form-grid">
              <Field label="Business name" required error={errors.business_name}>
                {(p) => <input {...p} className="input" value={form.business_name} onChange={set('business_name')} />}
              </Field>
              <Field label="Business category" required error={errors.category}>
                {(p) => (
                  <select {...p} className="select" value={form.category} onChange={set('category')}>
                    <option value="">Choose…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Contact person" required error={errors.contact_name}>
                {(p) => <input {...p} className="input" value={form.contact_name} onChange={set('contact_name')} />}
              </Field>
              <Field label="Business location" required error={errors.location}>
                {(p) => <input {...p} className="input" placeholder="e.g. Kigali, Nyarugenge" value={form.location} onChange={set('location')} />}
              </Field>
              <Field label="Business email" required error={errors.email}>
                {(p) => <input {...p} className="input" type="email" value={form.email} onChange={set('email')} />}
              </Field>
              <Field label="Phone number" required error={errors.phone}>
                {(p) => <input {...p} className="input" type="tel" value={form.phone} onChange={set('phone')} />}
              </Field>
            </div>

            <h3 className="biz-form-h">
              <span>2</span> What you need
            </h3>
            <div className="form-grid">
              <Field label="Estimated monthly requirement" required error={errors.monthly_requirement}>
                {(p) => <input {...p} className="input" placeholder="e.g. 30 kg" value={form.monthly_requirement} onChange={set('monthly_requirement')} />}
              </Field>
              <Field label="Order frequency">
                {(p) => (
                  <select {...p} className="select" value={form.frequency} onChange={set('frequency')}>
                    <option value="">Choose…</option>
                    {FREQ.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                )}
              </Field>
              <fieldset className="full" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-label" style={{ marginBottom: 8 }}>
                  Preferred package sizes
                </legend>
                <div className="chips">
                  {SIZES.map((s) => (
                    <button type="button" key={s} className="chip" aria-pressed={form.sizes.includes(s)} onClick={() => toggleSize(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Field label="Delivery requirements" className="full">
                {(p) => <input {...p} className="input" placeholder="How would you like to receive orders?" value={form.delivery} onChange={set('delivery')} />}
              </Field>
              <Field label="Additional comments" className="full">
                {(p) => <textarea {...p} className="textarea" value={form.comments} onChange={set('comments')} />}
              </Field>
            </div>

            {!ready ? (
              <button className="btn btn--forest btn--lg btn--block" style={{ marginTop: 20 }}>
                <Building2 size={18} /> Prepare my enquiry
              </button>
            ) : (
              <div className="stack" style={{ marginTop: 20, gap: 10 }}>
                <Notice variant="success" title="Your enquiry is ready.">
                  Send it to our team using one of the options below. We will reply to discuss your requirements.
                </Notice>
                <a className="btn btn--whatsapp btn--lg btn--block" href={waLink(message)} target="_blank" rel="noreferrer">
                  <WhatsAppIcon size={18} /> Send via WhatsApp
                </a>
                <a
                  className="btn btn--outline btn--block"
                  href={`mailto:${SITE.email}?subject=${encodeURIComponent(`Business enquiry - ${form.business_name}`)}&body=${encodeURIComponent(message)}`}
                >
                  <Mail size={17} /> Send via email
                </a>
              </div>
            )}
          </form>
        </div>
      </section>
    </div>
  )
}
