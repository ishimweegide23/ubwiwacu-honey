import { useEffect, useId } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Info, Loader2, Minus, Plus, X } from 'lucide-react'
import { MAX_QTY } from '../context/CartContext.jsx'
import { humanize } from '../lib/format.js'

export function Spinner({ size = 18 }) {
  return <Loader2 size={size} className="spinner" aria-hidden="true" />
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading-block" role="status">
      <Spinner size={28} />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="empty" role="alert">
      <div className="icon-tile" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
        <AlertTriangle size={30} />
      </div>
      <h3>{title}</h3>
      <p>{error?.message || 'Please try again.'}</p>
      {onRetry && (
        <button className="btn btn--outline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon = Info, title, children, action }) {
  return (
    <div className="empty">
      <div className="icon-tile">
        <Icon size={30} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Notice({ icon: Icon = Info, variant = '', title, children }) {
  return (
    <div className={`notice ${variant ? `notice--${variant}` : ''}`}>
      <Icon size={20} aria-hidden="true" />
      <div>
        {title && <strong>{title} </strong>}
        {children}
      </div>
    </div>
  )
}

export function Field({ label, required, hint, error, children, className = '', id: idProp }) {
  const auto = useId()
  const id = idProp || auto
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined
  const child =
    typeof children === 'function'
      ? children({ id, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': describedBy, required })
      : children
  return (
    <div className={`field ${className}`}>
      {label && (
        <label htmlFor={id}>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {child}
      {hint && !error && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error" id={`${id}-err`} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

export function QtyStepper({ value, onChange, min = 1, max = MAX_QTY, size, label = 'Quantity' }) {
  const set = (v) => {
    const n = Math.floor(Number(v))
    if (!Number.isFinite(n)) return
    onChange(Math.max(min, Math.min(max, n)))
  }
  return (
    <div className={`qty ${size === 'sm' ? 'qty--sm' : ''}`} role="group" aria-label={label}>
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label="Decrease quantity">
        <Minus size={16} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => set(e.target.value || min)}
        aria-label={label}
      />
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label="Increase quantity">
        <Plus size={16} />
      </button>
    </div>
  )
}

const PAYMENT_VARIANT = {
  pending: 'warn',
  verification: 'info',
  paid: 'success',
  rejected: 'danger',
  refunded: 'muted',
}
const FULFIL_VARIANT = {
  received: 'muted',
  awaiting_payment: 'warn',
  payment_verification: 'info',
  paid: 'success',
  preparing: 'info',
  ready: 'forest',
  fulfilled: 'success',
  cancelled: 'danger',
  refunded: 'muted',
}
const PAYMENT_TEXT = {
  pending: 'Awaiting payment',
  verification: 'Being verified',
  paid: 'Paid',
  rejected: 'Not confirmed',
  refunded: 'Refunded',
}
const FULFIL_TEXT = {
  received: 'Order received',
  awaiting_payment: 'Awaiting payment',
  payment_verification: 'Payment verification',
  paid: 'Paid',
  preparing: 'Preparing',
  ready: 'Ready',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export function PaymentBadge({ status }) {
  return <span className={`badge badge--${PAYMENT_VARIANT[status] || 'muted'}`}>{PAYMENT_TEXT[status] || humanize(status)}</span>
}
export function FulfilmentBadge({ status }) {
  return <span className={`badge badge--${FULFIL_VARIANT[status] || 'muted'}`}>{FULFIL_TEXT[status] || humanize(status)}</span>
}
export const fulfilmentText = (s) => FULFIL_TEXT[s] || humanize(s)
export const paymentText = (s) => PAYMENT_TEXT[s] || humanize(s)

export function Modal({ title, onClose, children, footer, size }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size === 'lg' ? 'modal--lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Breadcrumb({ items }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={it.label} className="row" style={{ gap: 6 }}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  )
}

export function Pager({ meta, onPage }) {
  if (!meta || meta.pages <= 1) {
    return meta ? <div className="pager">{meta.total} result{meta.total === 1 ? '' : 's'}</div> : null
  }
  return (
    <div className="pager">
      <span>
        Page {meta.page} of {meta.pages} · {meta.total} results
      </span>
      <div className="row">
        <button className="btn btn--outline btn--sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </button>
        <button className="btn btn--outline btn--sm" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>
          Next
        </button>
      </div>
    </div>
  )
}
