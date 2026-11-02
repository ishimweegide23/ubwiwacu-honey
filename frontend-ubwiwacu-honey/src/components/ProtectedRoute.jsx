import { Link, Navigate, useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { Loading } from './ui.jsx'

/**
 * Role groups mirror the backend's ROLE_GROUPS (src/config/constants.js).
 * The server enforces these on every request; the UI checks them too so
 * staff never see screens they cannot use.
 */
export const ROLE_GROUPS = {
  DASHBOARD: ['admin', 'manager'], // analytics endpoint is admin/manager only
  CATALOGUE: ['admin', 'manager'],
  ORDERS: ['admin', 'manager'],
  PAYMENTS: ['admin', 'manager', 'verifier'],
  RECEIPTS: ['admin', 'manager', 'verifier', 'cashier'],
  POS: ['admin', 'cashier'],
  REPORTS: ['admin', 'manager'],
  AUDIT: ['admin'],
}

export const canAccess = (role, roles) => !roles || roles.includes(role)

/** First admin page a role may open, so cashiers/verifiers don't land on a "No access" dashboard. */
const LANDING = [
  ['/admin', ROLE_GROUPS.DASHBOARD],
  ['/admin/payments', ROLE_GROUPS.PAYMENTS],
  ['/admin/pos', ROLE_GROUPS.POS],
  ['/admin/receipts', ROLE_GROUPS.RECEIPTS],
]
export const adminHome = (role) => LANDING.find(([, roles]) => canAccess(role, roles))?.[0] || '/admin'

/**
 * <ProtectedRoute roles={ROLE_GROUPS.ORDERS}>…</ProtectedRoute>
 * - still checking the token  → loading screen
 * - no / invalid token        → redirect to /admin/login (returns here after login)
 * - role not allowed          → "no access" message
 */
export default function ProtectedRoute({ roles, children }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'checking') return <Loading label="Checking your session…" />
  if (status !== 'authenticated' || !user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (!canAccess(user.role, roles)) {
    const home = adminHome(user.role)
    if (location.pathname === '/admin' && home !== '/admin') return <Navigate to={home} replace />
    return (
      <div className="empty">
        <div className="icon-tile" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          <Lock size={30} />
        </div>
        <h3>No access</h3>
        <p>
          Your role ({user.role}) cannot open this page. Use the menu to open a page you can access, or ask an
          administrator for access.
        </p>
        <Link to="/" className="btn btn--outline">
          Go to the shop
        </Link>
      </div>
    )
  }
  return children
}
