import { useRef } from 'react'

/** Six single-digit boxes. Supports typing, backspace, arrow keys and pasting the whole code. */
export default function OtpInput({ value, onChange, onComplete, disabled, invalid, length = 6 }) {
  const refs = useRef([])
  const digits = Array.from({ length }, (_, i) => value[i] || '')

  const setAt = (i, d) => {
    const next = digits.slice()
    next[i] = d
    const code = next.join('').slice(0, length)
    onChange(code)
    if (code.length === length && !code.includes('') && /^\d+$/.test(code)) onComplete?.(code)
  }

  const onInput = (i, e) => {
    const v = e.target.value.replace(/\D/g, '')
    if (!v) return
    if (v.length > 1) {
      // Pasted or autofilled several digits.
      const code = (digits.slice(0, i).join('') + v).slice(0, length)
      onChange(code)
      refs.current[Math.min(code.length, length - 1)]?.focus()
      if (code.length === length) onComplete?.(code)
      return
    }
    setAt(i, v)
    if (i < length - 1) refs.current[i + 1]?.focus()
  }

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[i]) setAt(i, '')
      else if (i > 0) {
        refs.current[i - 1]?.focus()
        setAt(i - 1, '')
      }
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus()
  }

  return (
    <div className={`otp ${invalid ? 'otp--invalid' : ''}`} role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className="otp-box"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? length : 1}
          value={d}
          disabled={disabled}
          autoFocus={i === 0}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => onInput(i, e)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  )
}
