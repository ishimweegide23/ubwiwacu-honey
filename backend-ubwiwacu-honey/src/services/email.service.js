import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { DELIVERY_NOTICE, PAYMENT_METHOD_LABELS, PAYMENT_SAFETY_NOTICE } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { escapeHtml, formatDateTime, formatRWF, renderTemplate } from '../utils/helpers.js';

let transporter = null;

const PLACEHOLDER = /^(your_|changeme|replace)/i;

export function isEmailConfigured() {
  return Boolean(env.EMAIL_HOST && env.EMAIL_USER && env.EMAIL_PASS && !PLACEHOLDER.test(env.EMAIL_PASS));
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_SECURE,
      auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

/**
 * Send one email. Throws on failure so callers can record delivery status.
 * @returns {Promise<{messageId:string}>}
 */
export async function sendMail({ to, subject, html, text, attachments }) {
  if (!to) throw new Error('No recipient email address');
  if (!isEmailConfigured()) throw new Error('Email is not configured on the server (EMAIL_PASS missing)');
  const info = await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    replyTo: env.BUSINESS_EMAIL,
    to,
    subject,
    html,
    text,
    attachments,
  });
  logger.info('Email sent', { to, subject, messageId: info.messageId });
  return { messageId: info.messageId };
}

export async function verifyTransport() {
  if (!isEmailConfigured()) return false;
  try {
    await getTransporter().verify();
    return true;
  } catch (err) {
    logger.warn('SMTP verification failed', { error: err.message });
    return false;
  }
}

const businessVars = () => ({
  business_name: env.BUSINESS_NAME,
  business_parent: env.BUSINESS_PARENT,
  business_email: env.BUSINESS_EMAIL,
  business_phone: env.BUSINESS_PHONE,
  business_whatsapp: env.BUSINESS_WHATSAPP,
  delivery_notice: DELIVERY_NOTICE,
  payment_safety_notice: PAYMENT_SAFETY_NOTICE,
  year: new Date().getFullYear(),
});

function itemRowsHtml(items) {
  return items
    .map(
      (i) => `<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.product_name)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.package_size)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${Number(i.quantity)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(formatRWF(i.unit_price_rwf))}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(formatRWF(i.line_total_rwf))}</td>
</tr>`,
    )
    .join('\n');
}

/** Order confirmation (public order view from order.service). */
export async function sendOrderConfirmation(order, to) {
  const instructions = env.PAYMENT_INSTRUCTIONS
    ? `<p style="white-space:pre-line">${escapeHtml(env.PAYMENT_INSTRUCTIONS)}</p>`
    : `<p>Our team will contact you with payment instructions. You can also reach us on ${escapeHtml(env.BUSINESS_PHONE)}.</p>`;

  const html = renderTemplate('email-order.html', {
    ...businessVars(),
    customer_name: order.customer?.name || 'Customer',
    order_number: order.order_number,
    order_date: formatDateTime(order.created_at),
    fulfilment_type: order.fulfilment_type === 'collection' ? 'Collection' : 'Delivery',
    payment_method: order.payment ? order.payment.method_label : 'To be confirmed',
    subtotal: formatRWF(order.subtotal_rwf),
    discount: formatRWF(order.discount_rwf),
    total: formatRWF(order.total_rwf),
    item_rows: itemRowsHtml(order.items),
    payment_instructions: instructions,
  });

  return sendMail({
    to,
    subject: `${env.BUSINESS_NAME} - Order ${order.order_number} received`,
    html,
    text: `Thank you for your order ${order.order_number}. Total: ${formatRWF(order.total_rwf)}. Status: awaiting payment. ${DELIVERY_NOTICE}`,
  });
}

const STATUS_MESSAGES = {
  preparing: 'Your order is being prepared.',
  ready: 'Your order is ready. Please confirm delivery or collection arrangements with us.',
  fulfilled: 'Your order has been completed. Thank you for choosing us!',
  cancelled: 'Your order has been cancelled. Contact us if you have any questions.',
  refunded: 'Your order has been refunded.',
};

/** Short status update for an orders row. */
export async function sendStatusUpdate(order) {
  const message = STATUS_MESSAGES[order.fulfilment_status];
  if (!message) return null;
  const html = `<div style="font-family:Arial,sans-serif;color:#3b2a14;max-width:560px">
  <h2 style="color:#b7791f">${escapeHtml(env.BUSINESS_NAME)}</h2>
  <p>Hello ${escapeHtml(order.customer_name)},</p>
  <p>Update on order <strong>${escapeHtml(order.order_number)}</strong>: ${escapeHtml(message)}</p>
  <p>${escapeHtml(DELIVERY_NOTICE)}</p>
  <p>Questions? ${escapeHtml(env.BUSINESS_PHONE)} · ${escapeHtml(env.BUSINESS_EMAIL)}</p>
</div>`;
  return sendMail({
    to: order.customer_email,
    subject: `${env.BUSINESS_NAME} - Order ${order.order_number} update`,
    html,
    text: `Order ${order.order_number}: ${message}`,
  });
}

/** Receipt email with the PDF attached. `data` is the receipt view from receipt.service. */
export async function sendReceiptEmail(data, to) {
  const html = renderTemplate('email-receipt.html', {
    ...businessVars(),
    customer_name: data.customer_name,
    receipt_number: data.receipt_number,
    order_number: data.order_number,
    issued_at: formatDateTime(data.issued_at),
    total_paid: formatRWF(data.amount_rwf),
    payment_method: PAYMENT_METHOD_LABELS[data.payment_method] || data.payment_method,
    transaction_ref: data.transaction_ref || '-',
    item_rows: itemRowsHtml(data.items),
  });
  return sendMail({
    to,
    subject: `${env.BUSINESS_NAME} - Receipt ${data.receipt_number} (Order ${data.order_number})`,
    html,
    text: `Payment received for order ${data.order_number}. Receipt ${data.receipt_number}. Amount paid: ${formatRWF(data.amount_rwf)}.`,
    attachments: data.file_path
      ? [{ filename: `${data.receipt_number}.pdf`, path: data.file_path, contentType: 'application/pdf' }]
      : undefined,
  });
}

/** Feedback request — template ready, wired up when the feedback module is added. */
export async function sendFeedbackRequest({ to, customer_name, order_number, feedback_url }) {
  const html = renderTemplate('email-feedback.html', {
    ...businessVars(),
    customer_name,
    order_number,
    feedback_url,
  });
  return sendMail({
    to,
    subject: `${env.BUSINESS_NAME} - How was your honey?`,
    html,
    text: `How was your order ${order_number}? Share your feedback: ${feedback_url}`,
  });
}
