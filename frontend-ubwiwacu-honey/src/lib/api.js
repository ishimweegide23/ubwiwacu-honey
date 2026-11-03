// Thin fetch wrapper for the Ubw'iwacu Honey API.
// Success: { success:true, data, pagination?, message? }  Error: { success:false, message, errors? }

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'ubh_admin_token'

export const apiUrl = (path) => `${BASE}${path}`

/** Absolute URL for an uploaded image path like /uploads/products/x.jpg */
export const assetUrl = (path) => (path ? (/^https?:/.test(path) ? path : `${BASE}${path}`) : null)

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message)
    this.status = status
    this.errors = errors || []
  }
  /** { field: message } for form display */
  get fieldErrors() {
    const map = {}
    for (const e of this.errors) if (e.field && !map[e.field]) map[e.field] = e.message
    return map
  }
}

let onUnauthorized = null
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn
}

// Called on every HTTP 429 (login, checkout and payment-reference limits on the server).
export const RATE_LIMIT_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.'
let onRateLimited = null
export const setRateLimitHandler = (fn) => {
  onRateLimited = fn
}

function handleStatus(status, message, auth) {
  if (status === 401 && auth && onUnauthorized) onUnauthorized()
  if (status === 429 && onRateLimited) onRateLimited(message || RATE_LIMIT_MESSAGE)
}

function buildQuery(params) {
  if (!params) return ''
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, v)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

async function request(method, path, { body, params, auth = false, raw = false, signal } = {}) {
  const headers = {}
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (auth) {
    const t = tokenStore.get()
    if (t) headers.Authorization = `Bearer ${t}`
  }

  let res
  try {
    res = await fetch(apiUrl(path) + buildQuery(params), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0)
  }

  if (raw) {
    if (!res.ok) {
      let msg = 'Request failed'
      try {
        msg = (await res.json()).message || msg
      } catch {
        /* not json */
      }
      if (res.status === 429 && msg === 'Request failed') msg = RATE_LIMIT_MESSAGE
      handleStatus(res.status, msg, auth)
      throw new ApiError(msg, res.status)
    }
    return res
  }

  let json = null
  try {
    json = await res.json()
  } catch {
    /* empty body */
  }

  if (!res.ok || json?.success === false) {
    const message = json?.message || (res.status === 429 ? RATE_LIMIT_MESSAGE : `Request failed (${res.status})`)
    handleStatus(res.status, message, auth)
    throw new ApiError(message, res.status, json?.errors)
  }
  return json
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),
  raw: (path, opts) => request('GET', path, { ...opts, raw: true }),
}

/** Download / open a protected file (PDF, CSV) with the admin token. */
export async function openProtectedFile(path, { download = false, filename } = {}) {
  const res = await api.raw(path, { auth: true })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  if (download) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'download'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } else {
    window.open(url, '_blank', 'noopener')
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ---- Endpoints ----
export const shopApi = {
  products: (params) => api.get('/api/products', { params }),
  product: (slug) => api.get(`/api/products/${encodeURIComponent(slug)}`),
  createOrder: (body) => api.post('/api/orders', body),
  track: (orderNumber) => api.get(`/api/orders/track/${encodeURIComponent(orderNumber)}`),
  submitReference: (orderNumber, body) =>
    api.post(`/api/orders/${encodeURIComponent(orderNumber)}/payment-reference`, body),
  locations: (parent) => api.get('/api/locations', { params: { parent } }),
  mobileConfig: () => api.get('/api/payments/mobile/config'),
  payMobile: (orderNumber, body) => api.post('/api/orders/' + encodeURIComponent(orderNumber) + '/pay/mobile', body),
  payMobileStatus: (orderNumber, paymentId, phone) => api.get('/api/orders/' + encodeURIComponent(orderNumber) + '/pay/mobile/' + paymentId, { params: { phone } }),
  searchLocations: (q, { signal, ...opts } = {}) => api.get('/api/locations/search', { params: { q, ...opts }, signal }),
  receiptUrl: (orderNumber, phone) =>
    apiUrl(`/api/orders/${encodeURIComponent(orderNumber)}/receipt?phone=${encodeURIComponent(phone)}`),
}

const A = { auth: true }
export const adminApi = {
  login: (body) => api.post('/api/auth/login', body),
  me: () => api.get('/api/auth/me', A),
  verifyLogin: (body) => api.post('/api/auth/login/verify', body),
  resendLogin: (body) => api.post('/api/auth/login/resend', body),
  forgotPassword: (body) => api.post('/api/auth/password/forgot', body),
  verifyReset: (body) => api.post('/api/auth/password/verify', body),
  resetPassword: (body) => api.post('/api/auth/password/reset', body),
  changePassword: (body) => api.put('/api/auth/password', body, A),
  setTwoFactor: (body) => api.patch('/api/auth/two-factor', body, A),

  customers: (params) => api.get('/api/admin/customers', { ...A, params }),
  search: (q, signal) => api.get('/api/admin/search', { ...A, params: { q }, signal }),
  customer: (id) => api.get(`/api/admin/customers/${id}`, A),

  dashboard: () => api.get('/api/admin/analytics/dashboard', A),
  productAnalytics: () => api.get('/api/admin/analytics/products', A),

  products: (params) => api.get('/api/admin/products', { ...A, params }),
  product: (id) => api.get(`/api/admin/products/${id}`, A),
  createProduct: (body) => api.post('/api/admin/products', body, A),
  updateProduct: (id, body) => api.put(`/api/admin/products/${id}`, body, A),
  deleteProduct: (id) => api.del(`/api/admin/products/${id}`, A),
  adjustStock: (id, body) => api.patch(`/api/admin/products/${id}/stock`, body, A),
  uploadImage: (id, file) => {
    const fd = new FormData()
    fd.append('image', file)
    return api.post(`/api/admin/products/${id}/image`, fd, A)
  },

  orders: (params) => api.get('/api/admin/orders', { ...A, params }),
  order: (id) => api.get(`/api/admin/orders/${id}`, A),
  createManualOrder: (body) => api.post('/api/admin/orders', body, A),
  updateStatus: (id, body) => api.patch(`/api/admin/orders/${id}/status`, body, A),
  cancelOrder: (id, body) => api.post(`/api/admin/orders/${id}/cancel`, body, A),

  payments: (params) => api.get('/api/admin/payments', { ...A, params }),
  verifyPayment: (orderId, body) => api.put(`/api/admin/payments/${orderId}/verify`, body, A),
  rejectPayment: (orderId, body) => api.put(`/api/admin/payments/${orderId}/reject`, body, A),

  receipts: (params) => api.get('/api/admin/receipts', { ...A, params }),
  receipt: (id) => api.get(`/api/admin/receipts/${id}`, A),
  resendReceipt: (id, body) => api.post(`/api/admin/receipts/${id}/resend`, body, A),
  retryFailedReceipts: () => api.post('/api/admin/receipts/retry-failed', {}, A),

  posSale: (body) => api.post('/api/pos/sale', body, A),
  posVoid: (id, body) => api.post(`/api/pos/sale/${id}/void`, body, A),

  report: (params) => api.get('/api/admin/reports', { ...A, params }),
  audit: (params) => api.get('/api/admin/audit', { ...A, params }),
}
