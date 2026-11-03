import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Coffee,
  Handshake,
  Hotel,
  Leaf,
  MapPin,
  MessageCircle,
  Package,
  ShoppingBasket,
  Truck,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from '../components/Brand.jsx'
import ProductCard, { ProductGridSkeleton } from '../components/ProductCard.jsx'
import { ErrorState } from '../components/ui.jsx'
import { useCart } from '../context/CartContext.jsx'
import { shopApi } from '../lib/api.js'
import { useAsync, usePageMeta } from '../lib/useAsync.js'
import { formatNumber, waLink } from '../lib/format.js'
import { SITE } from '../config/site.js'
import { PHOTOS } from '../config/photos.js'

const MARQUEE = ['100% Natural', 'Made in Rwanda', '350 g to 7 kg', 'Order on WhatsApp', 'Business supply', 'Premium gift package']

const COMB = [
  { src: PHOTOS.g500Highlands, alt: 'A pyramid of 500 g Ubw’iwacu Honey jars in the Rwandan hills', cls: 'comb-cell--main' },
  { src: PHOTOS.kg1Street, alt: 'A 1 kg jar on a sunny Rwandan street', cls: 'comb-cell--a' },
  { src: PHOTOS.mixStack, alt: '1 kg and 500 g jars stacked against a stone wall', cls: 'comb-cell--b' },
  { src: PHOTOS.kg7Jug, alt: 'The 7 kg can with honeycomb and a honey dipper', cls: 'comb-cell--c' },
  { src: PHOTOS.kg1Pyramid, alt: 'Four 1 kg jars stacked in a pyramid', cls: 'comb-cell--d' },
]

// Tabs for the home shop. Any product the admin adds lands in 'All' (and the matching tab) automatically.
const SHOP_TABS = [
  { key: 'all', label: 'All honey', test: () => true },
  { key: 'featured', label: 'Favourites', test: (p) => p.is_featured },
  { key: 'everyday', label: 'Everyday', test: (p) => p.category !== 'premium' && p.weight_grams <= 1000 },
  { key: 'bulk', label: 'Bulk', test: (p) => p.weight_grams >= 5000 },
  { key: 'gift', label: 'Gifts', test: (p) => p.category === 'premium' },
]

const WHY = [
  { icon: Leaf, title: 'Rooted in Rwanda', text: 'Inspired by the natural richness of Rwanda and the people who bring honey from its source.' },
  { icon: Package, title: 'Six package sizes', text: 'From a 350 g first taste to 7 kg for busy kitchens, plus a Premium 1 kg gift package.' },
  { icon: Users, title: 'Homes and businesses', text: 'Sizes chosen for individuals, families, cafés, restaurants and other regular honey users.' },
  { icon: MessageCircle, title: 'Talk to real people', text: 'Order online as a guest or message us on WhatsApp. We confirm every order with you.' },
]

const STEPS = [
  { title: 'Sourced', text: 'Through our relationships with Rwandan farmers and beekeepers.', photo: PHOTOS.kg1Outdoor },
  { title: 'Packed', text: 'Into the size that suits you, from a 350 g jar to a 7 kg can.', photo: PHOTOS.mixStack },
  { title: 'On its way', text: 'You choose delivery or collection. Delivery is arranged and paid by you.', photo: PHOTOS.kg1Street },
]

const SEGMENTS = [
  { icon: Coffee, label: 'Cafés' },
  { icon: UtensilsCrossed, label: 'Restaurants' },
  { icon: Hotel, label: 'Hotels' },
  { icon: ShoppingBasket, label: 'Retailers' },
]

const GALLERY = [
  { src: PHOTOS.kg1Pyramid, alt: 'A pyramid of 1 kg jars outdoors' },
  { src: PHOTOS.g500Board, alt: 'Five 500 g jars on a wooden board' },
  { src: PHOTOS.g500Highlands, alt: '500 g jars in the Rwandan hills' },
  { src: PHOTOS.kg1Pair, alt: 'Two 1 kg jars under a blue sky' },
  { src: PHOTOS.kg7Jug, alt: 'A 7 kg can with honeycomb' },
  { src: PHOTOS.mixStack, alt: '1 kg and 500 g jars stacked together' },
  { src: PHOTOS.kg1Street, alt: 'A 1 kg jar on a sunny street' },
]

export default function Home() {
  usePageMeta(null, "Buy honey in Rwanda from Ubw'iwacu Honey. Packages from 350 g to 7 kg and a Premium 1 kg gift package. Order online or on WhatsApp.")
  const { data, error, loading, reload } = useAsync(() => shopApi.products({ limit: 50 }), [])
  const { syncProducts } = useCart()
  const products = useMemo(() => data || [], [data])

  useEffect(() => {
    if (products.length) syncProducts(products)
  }, [products, syncProducts])

  const from = products.length ? Math.min(...products.map((p) => p.price_rwf)) : 2500
  const kg1 = products.find((p) => p.slug === 'ubwiwacu-honey-1kg')
  const [tab, setTab] = useState('all')
  const active = SHOP_TABS.find((t) => t.key === tab) || SHOP_TABS[0]
  const shown = products.filter(active.test).sort((a, b) => (a.category === 'premium') - (b.category === 'premium') || a.weight_grams - b.weight_grams)

  return (
    <>
      {/* Hero: copy + honeycomb of real photos */}
      <section className="hm-hero">
        <div className="container hm-hero-grid">
          <div className="hm-hero-copy">
            <span className="hm-kicker">
              <span className="hm-kicker-hex" /> Rwandan honey · {SITE.tagline}
            </span>
            <h1>
              Purely ours.
              <br />
              <em>Truly Rwanda.</em>
            </h1>
            <p className="hm-lead">
              Natural honey from Rwanda’s hills, packed in six sizes, from a 350 g jar for your morning tea to a 7 kg
              can for your café kitchen.
            </p>
            <div className="hm-cta">
              <Link to="/shop" className="btn btn--dark btn--lg">
                Shop honey <ArrowRight size={18} />
              </Link>
              <a className="hm-wa" href={waLink("Hello Ubw'iwacu Honey. I would like to place an order.")} target="_blank" rel="noreferrer">
                <span>
                  <WhatsAppIcon size={18} />
                </span>
                Order on WhatsApp
              </a>
            </div>
            <dl className="hm-stats">
              <div>
                <dt>From</dt>
                <dd>
                  {formatNumber(from)} <small>RWF</small>
                </dd>
              </div>
              <div>
                <dt>Sizes</dt>
                <dd>350 g – 7 kg</dd>
              </div>
              <div>
                <dt>Made in</dt>
                <dd>Rwanda</dd>
              </div>
            </dl>
          </div>

          <div className="comb" aria-label="Ubw’iwacu Honey photos">
            {COMB.map((c) => (
              <figure key={c.cls} className={`comb-cell ${c.cls}`}>
                <img src={c.src} alt={c.alt} loading={c.cls.includes('main') ? 'eager' : 'lazy'} fetchPriority={c.cls.includes('main') ? 'high' : undefined} />
              </figure>
            ))}
            <span className="comb-hex comb-hex--1" aria-hidden="true" />
            <span className="comb-hex comb-hex--2" aria-hidden="true" />
            {kg1 && (
              <Link to={`/shop/${kg1.slug}`} className="comb-tag">
                <small>Family favourite</small>
                <strong>1 kg · {formatNumber(kg1.price_rwf)} RWF</strong>
                <ArrowUpRight size={16} />
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...MARQUEE, ...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={i}>
              {m} <span className="marquee-hex" />
            </span>
          ))}
        </div>
      </div>

      {/* Shop: every available product from the catalogue (new products appear automatically) */}
      <section className="section hshop" id="shop-honey">
        <div className="container">
          <div className="hshop-head">
            <div>
              <span className="eyebrow">Shop our honey</span>
              <h2>Pick your size, add to cart</h2>
              <p>Natural Rwandan honey in every size. Prices are per package, in Rwandan francs.</p>
            </div>
            <div className="seg hshop-tabs" role="tablist" aria-label="Filter products">
              {SHOP_TABS.map((t) => {
                const n = products.filter(t.test).length
                if (!n && t.key !== 'all') return null
                return (
                  <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                    {t.label} <span className="hshop-n">{n}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {loading && !data ? (
            <ProductGridSkeleton count={6} />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : (
            <div className="product-grid hshop-grid">
              {shown.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          <div className="hshop-foot">
            <span>
              <Truck size={16} /> Order as a guest · pay with MoMo, Airtel or bank · delivery arranged by you
            </span>
            <Link to="/shop" className="btn btn--dark">
              Open the full shop <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Story band */}
      <section className="hm-story" style={{ '--bg': `url(${PHOTOS.g500Highlands})` }}>
        <div className="container hm-story-inner">
          <span className="eyebrow eyebrow--light">
            <MapPin size={14} /> From Rwanda’s hills
          </span>
          <blockquote>“{SITE.philosophy}”</blockquote>
          <p>
            In Kinyarwanda, <em>ubw’iwacu</em> means what is ours. We carry honey from the hands of Rwandan
            beekeepers to your table, with care and honest communication.
          </p>
          <Link to="/our-story" className="btn btn--light">
            Read our story <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Why */}
      <section className="section section--paper">
        <div className="container hm-why">
          <div className="hm-why-photo">
            <img src={PHOTOS.g500Display} alt="500 g Ubw’iwacu Honey jars with honeycomb" loading="lazy" />
            <span className="hm-why-badge">
              <strong>100%</strong> natural honey
            </span>
          </div>
          <div>
            <span className="eyebrow">Why Ubw’iwacu</span>
            <h2>Honey you can trust, made simple to order</h2>
            <ul className="hm-why-list">
              {WHY.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <span className="hex-icon">
                    <Icon size={20} />
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Journey */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it reaches you</span>
            <h2>From the hive to your door</h2>
          </div>
          <ol className="journey">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="journey-photo">
                  <img src={s.photo} alt="" loading="lazy" />
                  <span className="journey-num">{i + 1}</span>
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="journey-foot">
            <Truck size={18} /> Choose your delivery area at checkout. We search every village in Rwanda.
          </div>
        </div>
      </section>

      {/* Business */}
      <section className="section hm-biz">
        <div className="container hm-biz-grid">
          <div>
            <span className="eyebrow eyebrow--light">Business &amp; wholesale</span>
            <h2>Supplying kitchens that never stop</h2>
            <p>Our 5 kg and 7 kg cans are made for cafés, restaurants, hotels and retailers. Ask us for a quote and regular supply.</p>
            <div className="hm-segs">
              {SEGMENTS.map(({ icon: Icon, label }) => (
                <span key={label}>
                  <Icon size={16} /> {label}
                </span>
              ))}
            </div>
            <div className="row">
              <Link to="/business" className="btn btn--primary">
                <Handshake size={17} /> Request a quote
              </Link>
              <Link to="/shop?size=5kg" className="btn btn--glass">
                See bulk sizes
              </Link>
            </div>
          </div>
          <div className="hm-biz-cans">
            <img src={PHOTOS.kg5Studio} alt="5 kg can" loading="lazy" />
            <img src={PHOTOS.kg7Studio} alt="7 kg can" loading="lazy" />
            <img src={PHOTOS.kg7Jug} alt="" className="hm-biz-bg" loading="lazy" />
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="section">
        <div className="container">
          <div className="section-head section-head--split">
            <div>
              <span className="eyebrow">Follow the hive</span>
              <h2>{SITE.instagram.handle}</h2>
            </div>
            <div className="row">
              <a className="social-pill" href={SITE.instagram.url} target="_blank" rel="noreferrer">
                <InstagramIcon size={18} /> Instagram
              </a>
              <a className="social-pill" href={SITE.tiktok.url} target="_blank" rel="noreferrer">
                <TikTokIcon size={18} /> TikTok
              </a>
            </div>
          </div>
          <div className="hexgrid">
            {GALLERY.map((g) => (
              <a key={g.alt} className="hexgrid-cell" href={SITE.instagram.url} target="_blank" rel="noreferrer" aria-label={`${g.alt} (opens Instagram)`}>
                <img src={g.src} alt={g.alt} loading="lazy" />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section section--tight">
        <div className="container">
          <div className="hm-cta-band">
            <div>
              <h2>Ready for something sweet?</h2>
              <p>Order online in a minute, or send us a WhatsApp message. No account needed.</p>
            </div>
            <div className="row">
              <Link to="/shop" className="btn btn--dark btn--lg">
                Shop honey <ArrowRight size={18} />
              </Link>
              <a className="btn btn--whatsapp btn--lg" href={waLink("Hello Ubw'iwacu Honey. I would like to place an order.")} target="_blank" rel="noreferrer">
                <WhatsAppIcon size={18} /> WhatsApp
              </a>
            </div>
            <img src={PHOTOS.kg1Studio} alt="" className="hm-cta-img" loading="lazy" />
          </div>
        </div>
      </section>
    </>
  )
}
