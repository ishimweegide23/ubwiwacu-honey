import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { formatDateTime, formatRWF } from './helpers.js';

const COLORS = { brand: '#B7791F', dark: '#3B2A14', muted: '#7A6650', light: '#FDF1DC', line: '#E5DCCB' };

/**
 * Render a receipt PDF to `filePath`. Resolves when the file is fully written.
 * @param {object} r receipt view built by receipt.service (all values already from the DB)
 */
export function writeReceiptPdf(r, filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Receipt ${r.receipt_number}`, Author: r.business.name } });
    const tmpPath = `${filePath}.tmp`;
    const out = fs.createWriteStream(tmpPath);
    out.on('error', reject);
    out.on('finish', () => {
      fs.rename(tmpPath, filePath, (err) => (err ? reject(err) : resolve(filePath)));
    });
    doc.on('error', reject);
    doc.pipe(out);

    const left = 50;
    const right = doc.page.width - 50;
    const width = right - left;

    // ---- Header ----
    doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(22).text(r.business.name, left, 50);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9)
      .text(r.business.parent, left, 76)
      .text(`${r.business.phone}  |  ${r.business.email}`, left, 89);

    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(18).text('RECEIPT', left, 50, { width, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(11).text(r.receipt_number, left, 74, { width, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(formatDateTime(r.issued_at), left, 89, { width, align: 'right' });

    doc.moveTo(left, 108).lineTo(right, 108).lineWidth(2).strokeColor(COLORS.brand).stroke();

    // ---- Details (two columns) ----
    const detail = (label, value, x, y) => {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(label.toUpperCase(), x, y);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.dark).text(value || '-', x, y + 10, { width: width / 2 - 10 });
    };
    let y = 122;
    detail('Billed to', r.customer_name, left, y);
    detail('Order number', r.order_number, left + width / 2, y);
    y += 30;
    detail('Phone', r.customer_phone, left, y);
    detail('Payment method', r.payment_method_label, left + width / 2, y);
    y += 30;
    detail('Email', r.customer_email, left, y);
    detail('Transaction reference', r.transaction_ref, left + width / 2, y);
    y += 30;
    detail('Order date', formatDateTime(r.order_created_at), left, y);
    detail('Payment status', String(r.payment_status).toUpperCase(), left + width / 2, y);
    y += 40;

    // ---- Items table ----
    const cols = [
      { key: 'product_name', label: 'Product', x: left, w: 200, align: 'left' },
      { key: 'package_size', label: 'Size', x: left + 205, w: 60, align: 'left' },
      { key: 'quantity', label: 'Qty', x: left + 270, w: 40, align: 'right' },
      { key: 'unit', label: 'Unit price', x: left + 315, w: 85, align: 'right' },
      { key: 'line', label: 'Subtotal', x: left + 405, w: width - 405, align: 'right' },
    ];
    doc.rect(left, y, width, 20).fill(COLORS.light);
    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(9);
    cols.forEach((c) => doc.text(c.label, c.x + 4, y + 6, { width: c.w - 8, align: c.align }));
    y += 24;

    doc.font('Helvetica').fontSize(9);
    for (const item of r.items) {
      const values = {
        product_name: item.product_name,
        package_size: item.package_size,
        quantity: String(item.quantity),
        unit: formatRWF(item.unit_price_rwf),
        line: formatRWF(item.line_total_rwf),
      };
      const rowH = Math.max(16, doc.heightOfString(values.product_name, { width: cols[0].w - 8 }) + 6);
      if (y + rowH > doc.page.height - 160) {
        doc.addPage();
        y = 50;
      }
      cols.forEach((c) => doc.fillColor(COLORS.dark).text(values[c.key], c.x + 4, y + 3, { width: c.w - 8, align: c.align }));
      y += rowH;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(COLORS.line).stroke();
    }

    // ---- Totals ----
    y += 10;
    const totalRow = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(COLORS.dark);
      doc.text(label, left + width - 250, y, { width: 130, align: 'left' });
      doc.text(value, left + width - 120, y, { width: 120, align: 'right' });
      y += bold ? 20 : 16;
    };
    totalRow('Subtotal', formatRWF(r.subtotal_rwf));
    totalRow('Discount', formatRWF(r.discount_rwf));
    doc.moveTo(left + width - 250, y).lineTo(right, y).lineWidth(1).strokeColor(COLORS.dark).stroke();
    y += 6;
    totalRow('Total paid', formatRWF(r.amount_rwf), true);
    totalRow('Balance', formatRWF(r.balance_rwf));

    // ---- Correction (refund/void notes; original figures are never overwritten) ----
    if (r.correction_ref) {
      y += 8;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#C0392B').text('CORRECTION', left, y);
      y += 12;
      doc.font('Helvetica').fontSize(9).text(r.correction_ref, left, y, { width });
      y += doc.heightOfString(r.correction_ref, { width }) + 6;
    }

    // ---- Notices ----
    y += 14;
    const noticeH = doc.heightOfString(r.delivery_notice, { width: width - 20 }) + 16;
    doc.rect(left, y, width, noticeH).fill('#FFF4E5');
    doc.rect(left, y, 3, noticeH).fill(COLORS.brand);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.dark).text(r.delivery_notice, left + 12, y + 8, { width: width - 20 });
    y += noticeH + 20;

    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text(`Thank you for choosing ${r.business.name}.`, left, y, { width, align: 'center' })
      .text('This receipt was issued after verification of your payment.', { width, align: 'center' });

    doc.end();
  });
}
