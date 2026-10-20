import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

const REQUIRED = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET',
  'BUSINESS_NAME',
  'BUSINESS_EMAIL',
  'BUSINESS_PHONE',
  'BUSINESS_WHATSAPP',
];

const missing = REQUIRED.filter((key) => !process.env[key] || !process.env[key].trim());
if (missing.length) {
  // Logger depends on env, so fail loudly on stderr before anything else boots.
  process.stderr.write(`[env] Missing required environment variables: ${missing.join(', ')}\n`);
  process.exit(1);
}

const str = (key, fallback = '') => (process.env[key] ?? fallback).trim();
const int = (key, fallback) => {
  const n = Number.parseInt(process.env[key], 10);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (key, fallback = false) => {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return ['true', '1', 'yes'].includes(v.trim().toLowerCase());
};
const absPath = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT_DIR, p));

const NODE_ENV = str('NODE_ENV', 'development');

if (NODE_ENV === 'production' && str('JWT_SECRET').length < 32) {
  process.stderr.write('[env] JWT_SECRET must be at least 32 characters in production\n');
  process.exit(1);
}

export const env = Object.freeze({
  NODE_ENV,
  isProd: NODE_ENV === 'production',
  PORT: int('PORT', 5000),
  TRUST_PROXY: bool('TRUST_PROXY', false),

  DB_HOST: str('DB_HOST'),
  DB_PORT: int('DB_PORT', 5432),
  DB_NAME: str('DB_NAME'),
  DB_USER: str('DB_USER'),
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_SSL: bool('DB_SSL', false),
  DB_POOL_MAX: int('DB_POOL_MAX', 10),

  JWT_SECRET: str('JWT_SECRET'),
  JWT_EXPIRES_IN: str('JWT_EXPIRES_IN', '8h'),

  ADMIN_NAME: str('ADMIN_NAME', 'Administrator'),
  ADMIN_EMAIL: str('ADMIN_EMAIL'),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',

  BUSINESS_NAME: str('BUSINESS_NAME'),
  BUSINESS_PARENT: str('BUSINESS_PARENT', 'IBAKWE Business Group'),
  BUSINESS_EMAIL: str('BUSINESS_EMAIL'),
  BUSINESS_PHONE: str('BUSINESS_PHONE'),
  BUSINESS_WHATSAPP: str('BUSINESS_WHATSAPP'),
  PAYMENT_INSTRUCTIONS: str('PAYMENT_INSTRUCTIONS'),

  RECEIPT_STORAGE: absPath(str('RECEIPT_STORAGE', './storage/receipts')),
  UPLOAD_STORAGE: absPath(str('UPLOAD_STORAGE', './storage/uploads/products')),
  MAX_UPLOAD_MB: int('MAX_UPLOAD_MB', 5),

  EMAIL_HOST: str('EMAIL_HOST'),
  EMAIL_PORT: int('EMAIL_PORT', 587),
  EMAIL_SECURE: bool('EMAIL_SECURE', false),
  EMAIL_USER: str('EMAIL_USER'),
  EMAIL_PASS: process.env.EMAIL_PASS || '',
  EMAIL_FROM: str('EMAIL_FROM') || `${str('BUSINESS_NAME')} <${str('EMAIL_USER') || str('BUSINESS_EMAIL')}>`,

  CLIENT_URLS: str('CLIENT_URL', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  RATE_LIMIT_WINDOW_MS: int('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  RATE_LIMIT_LOGIN_MAX: int('RATE_LIMIT_LOGIN_MAX', 5),
  RATE_LIMIT_CHECKOUT_MAX: int('RATE_LIMIT_CHECKOUT_MAX', 20),
  RATE_LIMIT_PAYMENT_MAX: int('RATE_LIMIT_PAYMENT_MAX', 10),

  RECEIPT_RETRY_INTERVAL_MS: int('RECEIPT_RETRY_INTERVAL_MS', 15 * 60 * 1000),

  GATEWAY_ENABLED: bool('GATEWAY_ENABLED', false),
  GATEWAY_WEBHOOK_SECRET: str('GATEWAY_WEBHOOK_SECRET') || str('GATEWAY_SECRET'),
});

// Make sure storage folders exist before anything writes to them.
for (const dir of [env.RECEIPT_STORAGE, env.UPLOAD_STORAGE]) {
  fs.mkdirSync(dir, { recursive: true });
}

export default env;
