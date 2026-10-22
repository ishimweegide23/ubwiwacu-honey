const ORDER_PREFIX = 'UBH';
const ORDER_PATTERN = /^UBH-\d{4}-\d{4,}$/;

/**
 * buildOrderNumber(1)            -> "UBH-2026-0001"
 * buildOrderNumber(12, 2027)     -> "UBH-2027-0012"
 * Sequences above 9999 keep growing ("UBH-2026-10000") rather than wrapping.
 */
export function buildOrderNumber(seq, year = new Date().getFullYear()) {
  const n = Number(seq);
  if (!Number.isInteger(n) || n <= 0) {
    throw new TypeError(`Invalid order sequence: ${seq}`);
  }
  return `${ORDER_PREFIX}-${year}-${String(n).padStart(4, '0')}`;
}

export function isValidOrderNumber(value) {
  return typeof value === 'string' && ORDER_PATTERN.test(value.trim().toUpperCase());
}

export function normalizeOrderNumber(value) {
  return String(value ?? '').trim().toUpperCase();
}
