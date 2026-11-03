import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Run an async loader and track { data, error, loading }. Re-runs when deps change.
 * `reload()` runs it again (e.g. after a mutation).
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true, meta: null })
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const runId = useRef(0)

  const run = useCallback(async () => {
    const id = ++runId.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await loaderRef.current()
      if (id !== runId.current) return
      setState({ data: res?.data ?? res, meta: res?.pagination ?? null, error: null, loading: false })
    } catch (error) {
      if (id !== runId.current) return
      setState((s) => ({ ...s, error, loading: false }))
    }
  }, [])

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) }
}

/** Set the document title and meta description for a page. */
export function usePageMeta(title, description) {
  useEffect(() => {
    const full = title ? `${title} | Ubw'iwacu Honey` : "Ubw'iwacu Honey | Purely Ours. Truly Rwanda."
    document.title = full
    if (description) {
      let tag = document.querySelector('meta[name="description"]')
      if (!tag) {
        tag = document.createElement('meta')
        tag.name = 'description'
        document.head.appendChild(tag)
      }
      tag.content = description
    }
    const og = document.querySelector('meta[property="og:title"]')
    if (og) og.content = full
  }, [title, description])
}
