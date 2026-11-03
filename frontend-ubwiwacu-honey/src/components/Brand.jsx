import { Link } from 'react-router-dom'

export function LogoMark({ className = 'logo-mark' }) {
  return (
    // The brand "U" holding a honey dipper (from the official logo).
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M9 14h46v20c0 12.7-10.3 23-23 23S9 46.7 9 34Z" fill="#3B2814" />
      <path d="M34.5 19.5 40 2.5" stroke="#F7C11E" strokeWidth="3.6" strokeLinecap="round" />
      <rect x="26" y="19" width="14" height="4.2" rx="2.1" fill="#F7C11E" />
      <rect x="22.5" y="25" width="21" height="4.6" rx="2.3" fill="#F7C11E" />
      <rect x="21" y="31.4" width="24" height="4.6" rx="2.3" fill="#F7C11E" />
      <rect x="22.5" y="37.8" width="21" height="4.6" rx="2.3" fill="#F7C11E" />
      <rect x="26.5" y="44.2" width="13" height="3.6" rx="1.8" fill="#F7C11E" />
    </svg>
  )
}

export function Logo({ to = '/', small = 'Honey · Rwanda', onClick }) {
  return (
    <Link to={to} className="logo" aria-label="Ubw'iwacu Honey home" onClick={onClick}>
      <LogoMark />
      <span className="logo-text">
        <strong>Ubw’iwacu</strong>
        <small>{small}</small>
      </span>
    </Link>
  )
}

/**
 * Stylised honey jar illustration. Used until real product photographs are uploaded
 * (spec §6.3: never present stock photography as the actual product).
 */
export function HoneyJar({ label = '', premium = false, scale = 1, className = 'jar', title }) {
  const lid = premium ? '#1d140a' : '#3d6b52'
  const lidHi = premium ? '#d9a634' : '#4f8a69'
  const labelBg = premium ? '#1d140a' : '#fffaf0'
  const labelFg = premium ? '#f4c95d' : '#2b1d0e'
  const id = `g${premium ? 'p' : 's'}${label.replace(/\W/g, '')}`
  return (
    <svg
      className={className}
      viewBox="0 0 120 150"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      style={scale !== 1 ? { width: `${scale * 100}%` } : undefined}
    >
      <defs>
        <linearGradient id={`${id}-honey`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f6cf63" />
          <stop offset=".55" stopColor="#dc9b20" />
          <stop offset="1" stopColor="#a86614" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".25" stopColor="#fff" stopOpacity="0" />
          <stop offset=".85" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity=".25" />
        </linearGradient>
      </defs>
      {/* lid */}
      <rect x="26" y="8" width="68" height="20" rx="6" fill={lid} />
      <rect x="26" y="8" width="68" height="6" rx="3" fill={lidHi} opacity=".7" />
      {premium && <rect x="26" y="22" width="68" height="3" fill="#d9a634" />}
      {/* neck */}
      <rect x="30" y="27" width="60" height="9" rx="3" fill="#c98a1c" />
      {/* body */}
      <path
        d="M22 44c0-6 5-10 11-10h54c6 0 11 4 11 10v84c0 8-6 14-14 14H36c-8 0-14-6-14-14Z"
        fill={`url(#${id}-honey)`}
      />
      <path
        d="M22 44c0-6 5-10 11-10h54c6 0 11 4 11 10v84c0 8-6 14-14 14H36c-8 0-14-6-14-14Z"
        fill={`url(#${id}-glass)`}
      />
      {/* drip */}
      <path d="M30 36h60v4c0 3-3 3-4 6-1 3-4 3-5 0-1-4-4-4-5 0-1 5-5 5-6 0-1-3-4-4-6 0H30Z" fill="#f4c95d" opacity=".9" />
      {/* label */}
      <rect x="30" y="66" width="60" height="50" rx="8" fill={labelBg} />
      {premium && <rect x="33" y="69" width="54" height="44" rx="6" fill="none" stroke="#d9a634" strokeWidth="1.2" />}
      <path d="M60 74l6 3.5v7L60 88l-6-3.5v-7Z" fill={premium ? '#d9a634' : '#b7791f'} />
      <text x="60" y="100" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontSize="9" fontWeight="700" fill={labelFg}>
        UBW’IWACU
      </text>
      <text x="60" y="110" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="7.5" fontWeight="600" fill={labelFg} opacity=".8">
        {label}
      </text>
      {/* shine */}
      <rect x="28" y="48" width="5" height="70" rx="2.5" fill="#fff" opacity=".35" />
    </svg>
  )
}

export function InstagramIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TikTokIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 3c.4 2.3 1.9 3.9 4.2 4.1v3.1c-1.5.1-2.9-.3-4.2-1.1v6.3c0 3.5-2.6 5.9-5.8 5.9A5.8 5.8 0 0 1 5 15.5c0-3.5 3-6.1 6.6-5.6v3.2c-1.7-.4-3.4.7-3.4 2.4 0 1.4 1.1 2.6 2.6 2.6 1.6 0 2.6-1.1 2.6-2.9V3h3.2Z" />
    </svg>
  )
}

export function WhatsAppIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  )
}
