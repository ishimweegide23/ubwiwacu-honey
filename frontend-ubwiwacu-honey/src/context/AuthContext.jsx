import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { adminApi, setUnauthorizedHandler, tokenStore } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(tokenStore.get() ? 'checking' : 'anonymous')

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  useEffect(() => {
    if (status !== 'checking') return
    adminApi
      .me()
      .then((res) => {
        setUser(res.data)
        setStatus('authenticated')
      })
      .catch(() => logout())
  }, [status, logout])

  const startSession = useCallback((data) => {
    tokenStore.set(data.token)
    setUser(data.user)
    setStatus('authenticated')
    return data.user
  }, [])

  /** Password step. Returns { user } when signed in, or { twoFactor: {...} } when an emailed code is needed. */
  const login = useCallback(
    async (email, password) => {
      const res = await adminApi.login({ email, password })
      if (res.data.two_factor) return { twoFactor: res.data }
      return { user: startSession(res.data) }
    },
    [startSession],
  )

  /** Code step of two-step sign-in. */
  const verifyCode = useCallback(
    async (challenge, code) => {
      const res = await adminApi.verifyLogin({ challenge, code })
      return startSession(res.data)
    },
    [startSession],
  )

  const value = useMemo(
    () => ({ user, status, login, verifyCode, startSession, setUser, logout }),
    [user, status, login, verifyCode, startSession, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
