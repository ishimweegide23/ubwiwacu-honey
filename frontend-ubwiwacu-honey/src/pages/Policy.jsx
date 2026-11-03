import { Link, useParams } from 'react-router-dom'
import { usePageMeta } from '../lib/useAsync.js'
import { DELIVERY_NOTICE, PAYMENT_SAFETY, SITE } from '../config/site.js'
import NotFound from './NotFound.jsx'

// Policy text reflects how the system actually works. Items marked "to be confirmed"
// must be completed by the business before launch (spec §8.5: no invented refund periods).
const Contact = () => (
  <p>
    Contact us on <a href={`tel:${SITE.phone}`}>{SITE.phoneDisplay}</a> (phone / WhatsApp) or{' '}
    <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
  </p>
)

const POLICIES = {
  'delivery-returns': {
    title: 'Delivery, Returns & Refunds',
    body: (
      <>
        <h2>Delivery</h2>
        <p>{DELIVERY_NOTICE}</p>
        <ul>
          <li>Our website never adds a delivery fee to your order.</li>
          <li>If you pay an independent delivery provider, that payment is separate from the amount you pay Ubw’iwacu Honey.</li>
          <li>If you choose collection, we will contact you to confirm when and where your order is ready.</li>
          <li>We do not guarantee delivery times, because delivery is arranged by you.</li>
        </ul>
        <h2>Cancelling an order</h2>
        <ul>
          <li><strong>Unpaid orders:</strong> contact us to cancel. Reserved stock is released when the order is cancelled.</li>
          <li><strong>Paid orders not yet fulfilled:</strong> contact us as soon as possible. If the cancellation is approved, the refund is recorded against your order and receipt.</li>
          <li><strong>Fulfilled orders:</strong> please see damaged or incorrect products below.</li>
        </ul>
        <h2>Damaged or incorrect products</h2>
        <p>
          If you receive a damaged or incorrect product, contact us promptly with your order number and, where possible,
          a photo. We will review your case and agree the next steps with you.
        </p>
        <h2>Product quality complaints</h2>
        <p>Tell us about any concern with your order number. We take every complaint seriously and will respond directly.</p>
        <h2>Refunds</h2>
        <p>
          Refunds are approved by our team after review. When a refund is approved, we record it against your order and
          receipt (the original record is kept, not overwritten) and we tell you how and when the refund will be paid.
          Refund timelines are to be confirmed by the business.
        </p>
        <Contact />
      </>
    ),
  },
  privacy: {
    title: 'Privacy Policy',
    body: (
      <>
        <p>This policy explains what information Ubw’iwacu Honey collects through this website and how it is used.</p>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Order details:</strong> your name, phone number, optional email, the products you order, and your choice of delivery or collection.</li>
          <li><strong>Delivery details</strong> (only if you choose delivery): recipient name and phone, district, sector, cell, village, landmark, optional email and preferred time.</li>
          <li><strong>Payment references:</strong> the payment method and the transaction reference you submit, so our team can verify your payment.</li>
          <li><strong>Your cart</strong> is stored only in your own browser until you place an order.</li>
        </ul>
        <h2>What we never collect</h2>
        <p>{PAYMENT_SAFETY} We do not ask for or store card details. You do not need to create an account.</p>
        <h2>How we use it</h2>
        <ul>
          <li>To process, confirm and fulfil your order and to verify your payment.</li>
          <li>To issue your payment receipt and send order updates by email if you provided one.</li>
          <li>To respond to your questions and complaints.</li>
        </ul>
        <h2>Who can see it</h2>
        <p>
          Only authorised Ubw’iwacu Honey staff can access customer and payment information, through a password-protected
          administration area. Important administrative actions are logged. Our public order-tracking page hides most of
          your personal details, and downloading a receipt requires the phone number used for the order.
        </p>
        <h2>How long we keep it</h2>
        <p>We keep order and payment records for as long as needed for business and record-keeping purposes. The exact retention period is to be confirmed by the business.</p>
        <h2>Your choices</h2>
        <p>You may ask us to correct your information or ask questions about how it is used.</p>
        <Contact />
      </>
    ),
  },
  terms: {
    title: 'Terms & Conditions',
    body: (
      <>
        <p>By using this website and placing an order with Ubw’iwacu Honey ({SITE.parent}), you agree to these terms.</p>
        <h2>Products and prices</h2>
        <ul>
          <li>All prices are in Rwandan Francs (RWF). The price that applies is the price shown when you place your order; it is saved with your order.</li>
          <li>Our system calculates every total from our official prices. Orders depend on stock availability.</li>
        </ul>
        <h2>Orders</h2>
        <ul>
          <li>When you place an order you receive an order number. An order is not confirmed as paid until your payment has been verified by our team.</li>
          <li>Orders may also be placed by WhatsApp, phone or Instagram. Our team records these orders in the same system.</li>
        </ul>
        <h2>Payment</h2>
        <ul>
          <li>Use only the payment details provided by Ubw’iwacu Honey. {PAYMENT_SAFETY}</li>
          <li>Submitting a transaction reference or screenshot does not by itself mark an order as paid.</li>
          <li>A payment receipt is issued only after payment is verified.</li>
        </ul>
        <h2>Delivery</h2>
        <p>{DELIVERY_NOTICE}</p>
        <h2>Cancellations and refunds</h2>
        <p>
          See our <Link to="/policies/delivery-returns">Delivery, Returns &amp; Refunds</Link> policy.
        </p>
        <h2>Use of the website</h2>
        <p>Please do not misuse the website, submit false information or attempt to access the administration area.</p>
        <Contact />
      </>
    ),
  },
}

export default function Policy() {
  const { slug } = useParams()
  const policy = POLICIES[slug]
  usePageMeta(policy?.title)
  if (!policy) return <NotFound />
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Policies</span>
          <h1>{policy.title}</h1>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <article className="prose">{policy.body}</article>
        </div>
      </section>
    </>
  )
}
