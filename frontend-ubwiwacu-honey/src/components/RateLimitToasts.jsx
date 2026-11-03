import { useEffect, useRef } from 'react'
import { setRateLimitHandler } from '../lib/api.js'
import { useToast } from '../context/ToastContext.jsx'

/**
 * Shows one toast whenever the API answers 429 (rate limited), e.g. too many
 * login attempts, orders or payment-reference submissions. Repeated 429s within
 * a few seconds are collapsed into a single toast.
 */
export default function RateLimitToasts() {
  const toast = useToast()
  const last = useRef(0)

  useEffect(() => {
    setRateLimitHandler((message) => {
      const now = Date.now()
      if (now - last.current < 4000) return
      last.current = now
      toast.error(message, { duration: 7000 })
    })
    return () => setRateLimitHandler(null)
  }, [toast])

  return null
}
