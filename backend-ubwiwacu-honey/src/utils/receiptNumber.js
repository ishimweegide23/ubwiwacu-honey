const RECEIPT_PREFIX = 'RCP';
const RECEIPT_PATTERN = /^RCP-\d{4}-\d{4,}$/;

/**
 * buildReceiptNumber(1)        -> "RCP-2026-0001"
 * buildReceiptNumber(7, 2027)  -> "RCP-2027-0007"
 */
export function buildReceiptNumber(seq, year = new Date().getFullYear()) {
  const n = Number(seq);
  if (!Number.isInteger(n) || n <= 0) {
    throw new TypeError(`Invalid receipt sequence: ${seq}`);
  }
  return `${RECEIPT_PREFIX}-${year}-${String(n).padStart(4, '0')}`;
}

export function isValidReceiptNumber(value) {
  return typeof value === 'string' && RECEIPT_PATTERN.test(value.trim().toUpperCase());
}
