import { Printer } from 'lucide-react'
import { LogoMark } from './Brand.jsx'
import { formatDateTime, formatRWF, humanize } from '../lib/format.js'
import { DELIVERY_NOTICE, PAYMENT_SAFETY, SITE } from '../config/site.js'

/** Accepts the admin order (flat fields) or the public order (nested customer/delivery). */
function normalise(o) {
  const c = o.customer || { name: o.customer_name, phone: o.customer_phone, email: o.customer_email }
  const d =
    o.delivery ||
    (o.fulfilment_type === 'delivery'
      ? {
          recipient_name: o.delivery_recipient_name,
          phone: o.delivery_phone,
          address: o.delivery_address,
          village: o.delivery_village,
          cell: o.delivery_cell,
          sector: o.delivery_sector,
          district: o.delivery_district,
          province: o.delivery_province,
          landmark: o.delivery_landmark,
        }
      : null)
  return { ...o, c, d }
}

/** Printable invoice for an order (before or after payment). */
export default function Invoice({ order, actions }) {
  const o = normalise(order)
  const paid = o.payment_status === 'paid'
  const cancelled = ['cancelled', 'refunded'].includes(o.fulfilment_status)
  const place = o.d ? [o.d.village, o.d.cell, o.d.sector, o.d.district, o.d.province].filter(Boolean).join(', ') : ''
  const balance = o.balance_rwf ?? Math.max(0, o.total_rwf - (o.amount_paid_rwf || 0))

  return (
    <div className="inv-wrap">
      <div className="inv-toolbar no-print">
        {actions}
        <button className="btn btn--primary btn--sm" onClick={() => window.print()}>
          <Printer size={16} /> Print / save as PDF
        </button>
      </div>

      <article className="inv" aria-label={`Invoice for order ${o.order_number}`}>
        {(paid || cancelled) && <span className={`inv-stamp ${cancelled ? 'inv-stamp--void' : ''}`}>{cancelled ? humanize(o.fulfilment_status) : 'Paid'}</span>}

        <header className="inv-head">
          <div className="inv-brand">
            <LogoMark className="inv-logo" />
            <div>
              <strong>{SITE.name}</strong>
              <span>A brand of {SITE.parent}</span>
              <span>
                {SITE.phoneDisplay} · {SITE.email}
              </span>
              <span>Rwanda</span>
            </div>
          </div>
          <div className="inv-title">
            <h1>Invoice</h1>
            <dl>
              <div>
                <dt>Invoice no.</dt>
                <dd>INV-{o.order_number}</dd>
              </div>
              <div>
                <dt>Order no.</dt>
                <dd>{o.order_number}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{formatDateTime(o.created_at)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd className={paid ? 'inv-ok' : 'inv-due'}>{paid ? 'Paid' : cancelled ? humanize(o.fulfilment_status) : 'Payment due'}</dd>
              </div>
            </dl>
          </div>
        </header>

        <section className="inv-parties">
          <div>
            <h2>Bill to</h2>
            <strong>{o.c.name}</strong>
            {o.c.phone && <span>{o.c.phone}</span>}
            {o.c.email && <span>{o.c.email}</span>}
          </div>
          <div>
            <h2>{o.d ? 'Deliver to' : 'Collection'}</h2>
            {o.d ? (
              <>
                <strong>{o.d.recipient_name}</strong>
                {o.d.phone && <span>{o.d.phone}</span>}
                {place && <span>{place}</span>}
                {o.d.address && <span>{o.d.address}</span>}
                {o.d.landmark && <span>Landmark: {o.d.landmark}</span>}
              </>
            ) : (
              <span>Collected from Ubw’iwacu Honey. We confirm the time and place with you.</span>
            )}
          </div>
          <div>
            <h2>Order</h2>
            <span>Channel: {humanize(o.source || 'web')}</span>
            <span>Fulfilment: {humanize(o.fulfilment_type)}</span>
            {o.payment?.method_label && <span>Payment: {o.payment.method_label}</span>}
          </div>
        </section>

        <table className="inv-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Size</th>
              <th className="num">Qty</th>
              <th className="num">Unit price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((i, n) => (
              <tr key={`${i.product_name}-${i.package_size}-${n}`}>
                <td>{n + 1}</td>
                <td>{i.product_name}</td>
                <td>{i.package_size}</td>
                <td className="num">{i.quantity}</td>
                <td className="num">{formatRWF(i.unit_price_rwf)}</td>
                <td className="num">{formatRWF(i.line_total_rwf ?? i.unit_price_rwf * i.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="inv-bottom">
          <div className="inv-notes">
            <h2>{paid ? 'Thank you' : 'How to pay'}</h2>
            {paid ? (
              <p>Payment received. Your official payment receipt is issued separately.</p>
            ) : (
              <p>
                Pay from your phone (MTN MoMo or Airtel Money) on your order page, or pay and send us your transaction
                reference. Quote <strong>{o.order_number}</strong> with any payment.
              </p>
            )}
            <p className="inv-small">{DELIVERY_NOTICE}</p>
            <p className="inv-small">{PAYMENT_SAFETY}</p>
          </div>
          <dl className="inv-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatRWF(o.subtotal_rwf ?? o.total_rwf)}</dd>
            </div>
            {o.discount_rwf > 0 && (
              <div>
                <dt>Discount</dt>
                <dd>−{formatRWF(o.discount_rwf)}</dd>
              </div>
            )}
            <div>
              <dt>Delivery</dt>
              <dd>Not charged</dd>
            </div>
            <div className="inv-grand">
              <dt>Total (RWF)</dt>
              <dd>{formatRWF(o.total_rwf)}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>{formatRWF(o.amount_paid_rwf || (paid ? o.total_rwf : 0))}</dd>
            </div>
            <div className="inv-balance">
              <dt>Balance due</dt>
              <dd>{formatRWF(paid ? 0 : balance)}</dd>
            </div>
          </dl>
        </section>

        <footer className="inv-foot">
          {SITE.slogan} · {SITE.name} · {SITE.phoneDisplay} · {SITE.email}
        </footer>
      </article>
    </div>
  )
}
