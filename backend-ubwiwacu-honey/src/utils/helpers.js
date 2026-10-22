import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOW_STOCK_STATUS, PAGINATION, TIMEZONE } from '../config/constants.js';

const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

/** formatRWF(2500) -> "2,500 RWF" */
export function formatRWF(amount) {
  const n = Math.round(Number(amount) || 0);
  return `${n.toLocaleString('en-US')} RWF`;
}

/** slugify("Ubw'iwacu 1 kg") -> "ubwiwacu-1-kg" */
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 170);
}

/** safeGet(obj, 'a.b.c', fallback) — never throws on missing paths. */
export function safeGet(obj, pathStr, fallback = undefined) {
  if (obj == null) return fallback;
  const value = String(pathStr)
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  return value === undefined ? fallback : value;
}

/** 350 -> "350 g", 1000 -> "1 kg", 1500 -> "1.5 kg" */
export function formatPackageSize(weightGrams) {
  const g = Number(weightGrams);
  if (!Number.isFinite(g) || g <= 0) return '';
  if (g >= 1000) {
    const kg = g / 1000;
    return `${Number.isInteger(kg) ? kg : kg.toFixed(2).replace(/\.?0+$/, '')} kg`;
  }
  return `${g} g`;
}

/** "350g" | "350 g" | "1kg" | "1.5 kg" | "500" -> grams (number) or null */
export function parseSizeToGrams(value) {
  if (value === undefined || value === null || value === '') return null;
  const m = String(value).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(kg|g)?$/);
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  const grams = m[2] === 'kg' ? n * 1000 : n;
  return Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null;
}

export function stockStatus(stockQty, lowStockAt) {
  const qty = Number(stockQty) || 0;
  if (qty <= 0) return LOW_STOCK_STATUS.OUT_OF_STOCK;
  if (qty <= (Number(lowStockAt) || 0)) return LOW_STOCK_STATUS.LOW_STOCK;
  return LOW_STOCK_STATUS.IN_STOCK;
}

export function toInt(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

export function toBool(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(v)) return true;
  if (['false', '0', 'no'].includes(v)) return false;
  return fallback;
}

/** Trim strings; turn empty strings into null. */
export function clean(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

export function parsePagination(queryObj = {}) {
  const page = Math.max(1, toInt(queryObj.page, 1) || 1);
  const limit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, toInt(queryObj.limit, PAGINATION.DEFAULT_LIMIT) || PAGINATION.DEFAULT_LIMIT),
  );
  return { page, limit, offset: (page - 1) * limit };
}

export function paginationMeta(page, limit, total) {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

/**
 * Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD into Date bounds.
 * `to` is inclusive of the whole day (returned as exclusive upper bound = next day 00:00).
 * Dates are interpreted in Kigali time (UTC+2, no DST).
 */
export function parseDateRange(from, to) {
  const parse = (v) => {
    if (!v) return null;
    const s = String(v).trim();
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+02:00`) : new Date(s);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const fromDate = parse(from);
  let toDate = parse(to);
  if (fromDate === undefined || toDate === undefined) return { invalid: true };
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(String(to).trim())) {
    toDate = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
  }
  if (fromDate && toDate && fromDate >= toDate) return { invalid: true };
  return { from: fromDate, to: toDate };
}

export function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

/** "+250780737320" -> "+2507*****320" */
export function maskPhone(phone) {
  const s = String(phone ?? '');
  if (s.length <= 6) return s.replace(/./g, '*');
  return `${s.slice(0, 5)}${'*'.repeat(s.length - 8)}${s.slice(-3)}`;
}

/** "jane@example.com" -> "j***@example.com" */
export function maskEmail(email) {
  if (!email) return null;
  const [user, domain] = String(email).split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}

/** Digits only, keeps a leading +. Used to compare phone numbers loosely. */
export function normalizePhone(phone) {
  const s = String(phone ?? '').trim();
  const digits = s.replace(/\D/g, '');
  return s.startsWith('+') ? `+${digits}` : digits;
}

/** Last 9 digits are the subscriber number in Rwanda (07XXXXXXXX vs +2507XXXXXXXX). */
export function phonesMatch(a, b) {
  const da = String(a ?? '').replace(/\D/g, '');
  const db = String(b ?? '').replace(/\D/g, '');
  if (da.length < 9 || db.length < 9) return false;
  return da.slice(-9) === db.slice(-9);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const templateCache = new Map();

/**
 * Tiny template renderer: {{key}} is HTML-escaped, {{{key}}} is inserted raw
 * (only for HTML we build ourselves, e.g. table rows).
 */
export function renderTemplate(name, vars = {}) {
  let tpl = templateCache.get(name);
  if (!tpl) {
    tpl = fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8');
    templateCache.set(name, tpl);
  }
  return tpl
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, key) => String(safeGet(vars, key, '') ?? ''))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => escapeHtml(safeGet(vars, key, '')));
}

/**
 * Rows -> CSV string with BOM (so Excel reads UTF-8 correctly).
 * Text cells that start with = + - @ are prefixed with ' to block formula injection.
 */
export function toCsv(rows, columns) {
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    let s;
    if (v instanceof Date) s = v.toISOString();
    else if (typeof v === 'object') s = JSON.stringify(v);
    else s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const row of rows) lines.push(cols.map((c) => cell(row[c])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
