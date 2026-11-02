import { Link } from 'react-router-dom'
import { ArrowRight, Handshake, HeartHandshake, Leaf, MapPin, Quote } from 'lucide-react'
import { usePageMeta } from '../lib/useAsync.js'
import { PHOTOS } from '../config/photos.js'
import { SITE } from '../config/site.js'

const VALUES = [
  {
    icon: Leaf,
    title: 'Connected to Rwanda',
    text: 'Our brand is inspired by the natural richness of Rwanda and the people who help bring honey from its source to our customers.',
  },
  {
    icon: Handshake,
    title: 'Built on relationships',
    text: 'We work through relationships with farmers and beekeepers, and build lasting relationships with customers based on trust and reliability.',
  },
  {
    icon: HeartHandshake,
    title: 'Accessible to everyone',
    text: 'From a small package for a first taste to larger quantities for regular use, honey should be easy to enjoy for homes and businesses.',
  },
]

const RANGE = [
  { size: '350 g', text: 'A first taste', photo: null },
  { size: '500 g', text: 'Everyday sweetness', photo: PHOTOS.g500Single },
  { size: '1 kg', text: 'For the family', photo: PHOTOS.kg1Street },
  { size: '5 kg', text: 'Stock up', photo: PHOTOS.kg5Backdrop },
  { size: '7 kg', text: 'For kitchens', photo: PHOTOS.kg7Jug },
]

export default function OurStory() {
  usePageMeta('Our Story', "The meaning of Ubw'iwacu, our connection to Rwanda and our sourcing philosophy.")
  return (
    <>
      <section className="story-hero" style={{ '--bg': `url(${PHOTOS.g500Highlands})` }}>
        <div className="container story-hero-inner">
          <span className="eyebrow eyebrow--light">
            <MapPin size={14} /> Our story
          </span>
          <h1>
            Honey that is <em>truly ours.</em>
          </h1>
          <p>
            Ubw’iwacu Honey is a Rwandan honey brand by {SITE.parent}, bringing the sweetness of nature closer to homes
            and businesses.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container story-name">
          <div className="story-word">
            <span className="story-word-rw">Ubw’iwacu</span>
            <span className="story-word-eq">=</span>
            <span className="story-word-en">“what is ours, of home”</span>
          </div>
          <p className="lead">
            In Kinyarwanda, <em>ubw’iwacu</em> speaks of what belongs to us, of home. We chose the name because our honey
            comes from Rwanda’s own landscapes, and because we want every jar to feel like something from home.
          </p>
        </div>
      </section>

      <section className="section section--paper">
        <div className="container story-split">
          <div className="story-collage">
            <img src={PHOTOS.kg1Pyramid} alt="Four 1 kg jars of Ubw’iwacu Honey stacked outdoors" loading="lazy" />
            <img src={PHOTOS.mixStack} alt="1 kg and 500 g jars stacked against a stone wall" loading="lazy" />
            <span className="story-collage-hex" aria-hidden="true" />
          </div>
          <div>
            <span className="eyebrow">Our philosophy</span>
            <h2>We are porters of nature.</h2>
            <blockquote className="story-quote">
              <Quote size={22} />
              {SITE.philosophy}
            </blockquote>
            <p>
              We don’t claim to keep the bees ourselves. We connect customers with honey sourced through our
              relationships with farmers and beekeepers, and make it available in package sizes that suit real everyday
              needs.
            </p>
            <p>Our role is to carry nature’s sweetness from its source to your table with care, honesty and clear communication.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What we stand for</span>
            <h2>Our mission</h2>
            <p>To make honey accessible to households and businesses across Rwanda, while building lasting relationships based on trust and reliability.</p>
          </div>
          <div className="story-values">
            {VALUES.map(({ icon: Icon, title, text }, i) => (
              <article key={title} className="story-value">
                <span className="story-value-num">0{i + 1}</span>
                <span className="hex-icon">
                  <Icon size={22} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section story-range-section">
        <div className="container">
          <div className="section-head section-head--split">
            <div>
              <span className="eyebrow eyebrow--light">The range</span>
              <h2>One honey, for every need</h2>
            </div>
            <Link to="/shop" className="btn btn--light">
              Shop all sizes <ArrowRight size={16} />
            </Link>
          </div>
          <ol className="story-range">
            {RANGE.map((r) => (
              <li key={r.size}>
                <span className="story-range-img">{r.photo ? <img src={r.photo} alt="" loading="lazy" /> : <span>{r.size}</span>}</span>
                <strong>{r.size}</strong>
                <small>{r.text}</small>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="hm-cta-band">
            <div>
              <h2>{SITE.slogan}</h2>
              <p>{SITE.tagline} Find the package that suits you.</p>
            </div>
            <div className="row">
              <Link to="/shop" className="btn btn--dark btn--lg">
                Shop honey <ArrowRight size={18} />
              </Link>
              <Link to="/contact" className="btn btn--outline btn--lg">
                Contact us
              </Link>
            </div>
            <img src={PHOTOS.kg1Pyramid} alt="" className="hm-cta-img" loading="lazy" />
          </div>
        </div>
      </section>
    </>
  )
}
