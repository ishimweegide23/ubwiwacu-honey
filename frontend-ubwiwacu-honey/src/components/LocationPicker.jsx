import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronRight, ListTree, Loader2, MapPin, Search, X } from 'lucide-react'
import { shopApi } from '../lib/api.js'
import { PROVINCES } from '../config/rwanda.js'

const LEVEL_LABEL = { province: 'Province', district: 'District', sector: 'Sector', cell: 'Cell', village: 'Village' }
const CHAIN = ['province', 'district', 'sector', 'cell', 'village']

/**
 * Live search over Rwanda's administrative units (served by GET /api/locations/search).
 * Type a name ("kimihurura", "kacyiru gasabo") or an official code ("RW-S-013").
 */
export function LocationSearch({ level, placeholder, onPick, autoFocus, onUnavailable, initialQuery = '' }) {
  const [q, setQ] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const listId = useId()
  const boxRef = useRef(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      setMessage('')
      return undefined
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await shopApi.searchLocations(term, { level, limit: 12, signal: ctrl.signal })
        setResults(res.data)
        setActive(0)
        setOpen(true)
        setMessage(res.data.length ? '' : 'No place found. Check the spelling or try the sector or district name.')
      } catch (err) {
        if (err.name === 'AbortError') return
        if (err.status === 503) onUnavailable?.()
        setMessage(err.message)
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, level, onUnavailable])

  useEffect(() => {
    const close = (e) => !boxRef.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (r) => {
    onPick(r)
    setQ('')
    setResults([])
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(results[active])
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="loc-search" ref={boxRef}>
      <div className="loc-input">
        <Search size={18} />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
        />
        {loading ? <Loader2 size={17} className="spin" /> : q && (
          <button type="button" className="loc-clear" onClick={() => setQ('')} aria-label="Clear search">
            <X size={15} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="loc-results" id={listId} role="listbox">
          {results.map((r, i) => (
            <li
              key={r.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(r)
              }}
            >
              <MapPin size={16} />
              <span className="loc-result-text">
                <strong>{r.name}</strong>
                <small>{r.label.split(', ').slice(1).join(' · ')}</small>
              </span>
              <span className="loc-level">{LEVEL_LABEL[r.level]}</span>
            </li>
          ))}
        </ul>
      )}
      {message && q.trim().length >= 2 && !loading && <p className="loc-message">{message}</p>}
    </div>
  )
}

/** Step-by-step: Province → District → Sector → Cell → Village (GET /api/locations?parent=). */
function LocationBrowse({ onPick, onUnavailable }) {
  const [trail, setTrail] = useState([]) // chosen units, top-down
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const parent = trail.at(-1)?.code

  useEffect(() => {
    let alive = true
    setLoading(true)
    shopApi
      .locations(parent)
      .then((res) => alive && setOptions(res.data))
      .catch((err) => err.status === 503 && onUnavailable?.())
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [parent, onUnavailable])

  const choose = (unit) => {
    const next = [...trail, unit]
    if (unit.level === 'village') {
      const place = { code: unit.code, name: unit.name, level: 'village' }
      next.forEach((u) => (place[u.level] = u.name))
      place.label = [...next].reverse().map((u) => u.name).join(', ')
      onPick(place)
    } else setTrail(next)
  }

  const nextLevel = CHAIN[trail.length]
  return (
    <div className="loc-browse">
      <div className="loc-trail">
        <button type="button" onClick={() => setTrail([])} className={trail.length ? '' : 'is-on'}>
          Rwanda
        </button>
        {trail.map((u, i) => (
          <span key={u.code}>
            <ChevronRight size={14} />
            <button type="button" onClick={() => setTrail(trail.slice(0, i + 1))} className={i === trail.length - 1 ? 'is-on' : ''}>
              {u.name}
            </button>
          </span>
        ))}
      </div>
      <p className="loc-step">
        Choose a <strong>{LEVEL_LABEL[nextLevel]?.toLowerCase()}</strong>
      </p>
      {loading ? (
        <p className="loc-message">
          <Loader2 size={15} className="spin" /> Loading…
        </p>
      ) : (
        <div className="loc-options">
          {options.map((o) => (
            <button type="button" key={o.code} onClick={() => choose(o)}>
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Delivery address picker for checkout. `value` is the chosen village
 * ({ code, province, district, sector, cell, village, label }) or null.
 * When the server has no location dataset, falls back to typed fields (`manual`).
 */
export default function LocationPicker({ value, onChange, manual, onManualChange, error, initialQuery }) {
  const [mode, setMode] = useState('search')
  const [unavailable, setUnavailable] = useState(false)
  const markUnavailable = useCallback(() => setUnavailable(true), [])

  if (unavailable) {
    const m = manual
    const districts = PROVINCES.find((p) => p.name === m.province)?.districts || PROVINCES.flatMap((p) => p.districts)
    return (
      <div className="loc-manual">
        <p className="small muted" style={{ margin: '0 0 12px' }}>
          Type your address below. (Live location search is not available right now.)
        </p>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Province</span>
            <select className="select" value={m.province} onChange={(e) => onManualChange({ province: e.target.value, district: '' })}>
              <option value="">Choose…</option>
              {PROVINCES.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">District *</span>
            <select className="select" value={m.district} onChange={(e) => onManualChange({ district: e.target.value })} aria-invalid={error && !m.district ? 'true' : undefined}>
              <option value="">Choose…</option>
              {districts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          {['sector', 'cell', 'village'].map((k) => (
            <label className="field" key={k}>
              <span className="field-label">{LEVEL_LABEL[k]} *</span>
              <input className="input" value={m[k]} onChange={(e) => onManualChange({ [k]: e.target.value })} aria-invalid={error && !m[k].trim() ? 'true' : undefined} />
            </label>
          ))}
        </div>
      </div>
    )
  }

  if (value) {
    return (
      <div className="loc-chosen">
        <span className="loc-chosen-icon">
          <Check size={18} />
        </span>
        <div>
          <strong>{value.village}</strong>
          <small>
            {value.cell} cell · {value.sector} sector · {value.district} · {value.province}
          </small>
          <code>{value.code}</code>
        </div>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    )
  }

  return (
    <div className={`loc-picker ${error ? 'loc-picker--error' : ''}`} data-error={error ? 'true' : undefined}>
      <div className="loc-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'search'} onClick={() => setMode('search')}>
          <Search size={15} /> Search
        </button>
        <button type="button" role="tab" aria-selected={mode === 'browse'} onClick={() => setMode('browse')}>
          <ListTree size={15} /> Step by step
        </button>
      </div>
      {mode === 'search' ? (
        <>
          <LocationSearch
            level="village"
            placeholder="Type your village, cell or sector — e.g. Rugando, Kimihurura"
            onPick={onChange}
            onUnavailable={markUnavailable}
            initialQuery={initialQuery}
            autoFocus={Boolean(initialQuery)}
          />
          <p className="loc-hint">Tip: add the district to narrow it down (“Rugando Gasabo”), or enter an official code like RW-V-00001.</p>
        </>
      ) : (
        <LocationBrowse onPick={onChange} onUnavailable={markUnavailable} />
      )}
    </div>
  )
}
