import crypto from 'node:crypto';
import axios from 'axios';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';

/**
 * Mobile money "push" payments (MTN MoMo / Airtel Money, Rwanda).
 *
 *   1. requestPayment()  → provider sends a USSD prompt to the customer's phone
 *   2. customer approves on their phone with their PIN (we never see or handle the PIN)
 *   3. checkStatus()     → we ask the provider for the result (polling), and the provider
 *                          may also call our callback URL; both paths end in the same check.
 *
 * Drivers (env MOMO_PROVIDER):
 *   mock     development only: approves after ~12 s; phone ending in 0000 is declined.
 *   intouch  IntouchPay aggregator (one integration for MTN + Airtel Rwanda).
 *   (empty)  push payments are off; customers use the transaction-reference flow.
 */

const PROVIDER = String(process.env.MOMO_PROVIDER || (env.isProd ? '' : 'mock')).toLowerCase();
export const PUSH_TIMEOUT_MIN = 10;

/** 07xxxxxxxx / +2507xxxxxxxx / 2507xxxxxxxx → 2507xxxxxxxx (what Rwandan providers expect). */
export function normaliseMsisdn(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (/^2507\d{8}$/.test(d)) return d;
  if (/^07\d{8}$/.test(d)) return `25${d}`;
  if (/^7\d{8}$/.test(d)) return `250${d}`;
  return null;
}

/** MTN Rwanda numbers start 078/079, Airtel 072/073. Used to warn about a mismatched network. */
export function networkOf(msisdn) {
  const p = String(msisdn).slice(3, 5);
  if (p === '78' || p === '79') return 'mtn_momo';
  if (p === '72' || p === '73') return 'airtel';
  return null;
}

export function pushEnabled() {
  return PROVIDER === 'mock' || PROVIDER === 'intouch';
}
export const providerName = () => PROVIDER || 'none';

// ---------------------------------------------------------------------------
// mock driver
// ---------------------------------------------------------------------------
const mockStore = new Map(); // ref -> { startedAt, msisdn }
const mock = {
  async requestPayment({ ref, msisdn }) {
    mockStore.set(ref, { startedAt: Date.now(), msisdn });
    logger.warn(`[MOCK MOMO] Payment prompt "sent" to ${msisdn} for ${ref}. It will be approved in ~12 s.`);
    return { providerTxId: `MOCK-${ref.slice(0, 8)}`, status: 'pending', raw: 'mock_pending' };
  },
  async checkStatus({ ref }) {
    const tx = mockStore.get(ref);
    if (!tx) return { status: 'failed', raw: 'mock_unknown' };
    if (tx.msisdn.endsWith('0000')) return { status: 'failed', raw: 'mock_declined' };
    if (Date.now() - tx.startedAt < 12_000) return { status: 'pending', raw: 'mock_pending' };
    return { status: 'paid', raw: 'mock_successful', transactionRef: `MP${Date.now().toString().slice(-10)}` };
  },
};

// ---------------------------------------------------------------------------
// IntouchPay driver
// NOTE: field names follow IntouchPay's published "requestpayment" / "gettransactionstatus"
// API. Confirm them against the documentation Intouch gives you with your account before
// going live, and test with their sandbox account first.
// ---------------------------------------------------------------------------
const intouchCfg = () => ({
  base: (process.env.INTOUCH_BASE_URL || 'https://www.intouchpay.co.rw/api').replace(/\/$/, ''),
  username: process.env.INTOUCH_USERNAME || '',
  accountNo: process.env.INTOUCH_ACCOUNT_NO || '',
  partnerPassword: process.env.INTOUCH_PARTNER_PASSWORD || '',
  callbackUrl: process.env.MOMO_CALLBACK_URL || '',
});

function intouchAuth(cfg) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const password = crypto.createHash('sha256').update(cfg.username + cfg.accountNo + cfg.partnerPassword + timestamp).digest('hex');
  return { username: cfg.username, timestamp, password, accountno: cfg.accountNo };
}

const intouch = {
  async requestPayment({ ref, msisdn, amount }) {
    const cfg = intouchCfg();
    if (!cfg.username || !cfg.accountNo || !cfg.partnerPassword) {
      throw new ApiError(503, 'Mobile money is not configured on the server yet. Please pay with a transaction reference.');
    }
    const body = new URLSearchParams({
      ...intouchAuth(cfg),
      amount: String(amount),
      mobilephone: msisdn,
      requesttransactionid: ref,
      callbackurl: cfg.callbackUrl,
    });
    const { data } = await axios.post(`${cfg.base}/requestpayment/`, body, { timeout: 20_000 });
    if (data?.success === false && !/pending/i.test(String(data?.status))) {
      throw new ApiError(502, data?.message || 'The mobile money provider declined the request. Try again or use a reference.');
    }
    return { providerTxId: data?.transactionid ? String(data.transactionid) : null, status: 'pending', raw: String(data?.status || data?.responsecode || '') };
  },
  async checkStatus({ ref, providerTxId }) {
    const cfg = intouchCfg();
    const body = new URLSearchParams({ ...intouchAuth(cfg), requesttransactionid: ref, transactionid: providerTxId || '' });
    const { data } = await axios.post(`${cfg.base}/gettransactionstatus/`, body, { timeout: 15_000 });
    const raw = String(data?.status || data?.responsecode || '').toLowerCase();
    if (/success|successful|completed/.test(raw) || data?.responsecode === '01') {
      return { status: 'paid', raw, transactionRef: data?.transactionid ? String(data.transactionid) : providerTxId };
    }
    if (/fail|declin|cancel|expired|insufficient/.test(raw)) return { status: 'failed', raw };
    return { status: 'pending', raw };
  },
};

const drivers = { mock, intouch };

export async function requestPayment(args) {
  const d = drivers[PROVIDER];
  if (!d) throw new ApiError(503, 'Paying from your phone is not available yet. Please pay and send your transaction reference.');
  return d.requestPayment(args);
}

/** Never throws for provider hiccups: a failed check just means "still pending". */
export async function checkStatus(args) {
  const d = drivers[PROVIDER];
  if (!d) return { status: 'pending', raw: 'no_provider' };
  try {
    return await d.checkStatus(args);
  } catch (err) {
    logger.warn(`Mobile money status check failed for ${args.ref}: ${err.message}`);
    return { status: 'pending', raw: 'check_error' };
  }
}
