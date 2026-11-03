import { SITE } from '../config/site.js'

/** 2500 -> "2,500" */
export const formatNumber = (n) => Math.round(Number(n) || 0).toLocaleString('en-US')

/** 2500 -> "2,500 RWF" */
export const formatRWF = (n) => `${formatNumber(n)} RWF`

/** 350 -> "350 g", 1000 -> "1 kg" */
export function formatSize(grams) {
  const g = Number(grams)
  if (!g) return ''
  if (g >= 1000) {
    const kg = g / 1000
    return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`
  }
  return `${g} g`
}

const dtf = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Kigali',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const df = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Kigali',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export const formatDateTime = (v) => (v ? dtf.format(new Date(v)) : '—')
export const formatDate = (v) => (v ? df.format(new Date(v)) : '—')

export function timeAgo(v) {
  if (!v) return ''
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d ago`
  return formatDate(v)
}

/** Kigali date as YYYY-MM-DD (for date inputs) */
export function isoDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali' }).format(d)
}

export const humanize = (s) =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())

/** Rwandan phone check: 07XXXXXXXX or +2507XXXXXXXX (also accepts other international numbers). */
export function isValidPhone(v) {
  const s = String(v || '').replace(/[\s-]/g, '')
  return /^(\+?250)?0?7\d{8}$/.test(s) || /^\+\d{8,15}$/.test(s)
}

export const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim())

export function waLink(message) {
  return `https://wa.me/${SITE.whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ''}`
}

/** Pre-filled WhatsApp order message (spec §16.2). */
export function waOrderMessage(items, { name, arrangement } = {}) {
  const lines = ["Hello Ubw'iwacu Honey. I would like to place an order.", '']
  for (const i of items) {
    lines.push(`Product: ${i.name}`)
    lines.push(`Package Size: ${i.size}`)
    lines.push(`Quantity: ${i.quantity}`)
    lines.push(`Unit Price: ${formatRWF(i.price)}`)
    lines.push(`Product Total: ${formatRWF(i.price * i.quantity)}`)
    lines.push('')
  }
  lines.push(`Name: ${name || ''}`)
  lines.push(`Preferred Collection or Delivery Arrangement: ${arrangement || ''}`)
  lines.push('')
  lines.push('Please confirm availability and payment instructions.')
  return lines.join('\n')
}

export const uuid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })
