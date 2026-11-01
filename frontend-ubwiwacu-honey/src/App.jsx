import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CartProvider } from './context/CartContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import SiteLayout from './components/layout/SiteLayout.jsx'
import { Loading } from './components/ui.jsx'
import ProtectedRoute, { ROLE_GROUPS } from './components/ProtectedRoute.jsx'
import RateLimitToasts from './components/RateLimitToasts.jsx'
import Home from './pages/Home.jsx'
import Shop from './pages/Shop.jsx'
import ProductDetail from './pages/ProductDetail.jsx'
import Cart from './pages/Cart.jsx'
import Checkout from './pages/Checkout.jsx'
import OrderStatus from './pages/OrderStatus.jsx'
import Track from './pages/Track.jsx'
import OurStory from './pages/OurStory.jsx'
import Business from './pages/Business.jsx'
import Contact from './pages/Contact.jsx'
import Faq from './pages/Faq.jsx'
import Policy from './pages/Policy.jsx'
import NotFound from './pages/NotFound.jsx'

// Admin is code-split so customers never download it.
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'))
const Login = lazy(() => import('./admin/Login.jsx'))
const Dashboard = lazy(() => import('./admin/Dashboard.jsx'))
const Products = lazy(() => import('./admin/Products.jsx'))
const Orders = lazy(() => import('./admin/Orders.jsx'))
const OrderDetail = lazy(() => import('./admin/OrderDetail.jsx'))
const NewOrder = lazy(() => import('./admin/NewOrder.jsx'))
const Payments = lazy(() => import('./admin/Payments.jsx'))
const Receipts = lazy(() => import('./admin/Receipts.jsx'))
const Pos = lazy(() => import('./admin/Pos.jsx'))
const Reports = lazy(() => import('./admin/Reports.jsx'))
const Audit = lazy(() => import('./admin/Audit.jsx'))
const Customers = lazy(() => import('./admin/Customers.jsx'))
const Account = lazy(() => import('./admin/Account.jsx'))
const CustomerInvoice = lazy(() => import('./pages/InvoicePage.jsx').then((m) => ({ default: m.CustomerInvoice })))
const AdminInvoice = lazy(() => import('./pages/InvoicePage.jsx').then((m) => ({ default: m.AdminInvoice })))

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <RateLimitToasts />
        <AuthProvider>
          <CartProvider>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route element={<SiteLayout />}>
                  <Route index element={<Home />} />
                  <Route path="shop" element={<Shop />} />
                  <Route path="shop/:slug" element={<ProductDetail />} />
                  <Route path="cart" element={<Cart />} />
                  <Route path="checkout" element={<Checkout />} />
                  <Route path="order/:orderNumber" element={<OrderStatus />} />
                  <Route path="order/:orderNumber/invoice" element={<CustomerInvoice />} />
                  <Route path="track" element={<Track />} />
                  <Route path="our-story" element={<OurStory />} />
                  <Route path="business" element={<Business />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="faq" element={<Faq />} />
                  <Route path="policies/:slug" element={<Policy />} />
                  <Route path="*" element={<NotFound />} />
                </Route>

                <Route path="admin/login" element={<Login />} />
                <Route path="login" element={<Navigate to="/admin/login" replace />} />
                <Route
                  path="admin"
                  element={
                    <ProtectedRoute>
                      <AdminLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<ProtectedRoute roles={ROLE_GROUPS.DASHBOARD}><Dashboard /></ProtectedRoute>} />
                  <Route path="orders" element={<ProtectedRoute roles={ROLE_GROUPS.ORDERS}><Orders /></ProtectedRoute>} />
                  <Route path="orders/new" element={<ProtectedRoute roles={ROLE_GROUPS.ORDERS}><NewOrder /></ProtectedRoute>} />
                  <Route path="orders/:id" element={<ProtectedRoute roles={ROLE_GROUPS.ORDERS}><OrderDetail /></ProtectedRoute>} />
                  <Route path="orders/:id/invoice" element={<ProtectedRoute roles={ROLE_GROUPS.ORDERS}><AdminInvoice /></ProtectedRoute>} />
                  <Route path="payments" element={<ProtectedRoute roles={ROLE_GROUPS.PAYMENTS}><Payments /></ProtectedRoute>} />
                  <Route path="receipts" element={<ProtectedRoute roles={ROLE_GROUPS.RECEIPTS}><Receipts /></ProtectedRoute>} />
                  <Route path="pos" element={<ProtectedRoute roles={ROLE_GROUPS.POS}><Pos /></ProtectedRoute>} />
                  <Route path="products" element={<ProtectedRoute roles={ROLE_GROUPS.CATALOGUE}><Products /></ProtectedRoute>} />
                  <Route path="reports" element={<ProtectedRoute roles={ROLE_GROUPS.REPORTS}><Reports /></ProtectedRoute>} />
                  <Route path="customers" element={<ProtectedRoute roles={ROLE_GROUPS.ORDERS}><Customers /></ProtectedRoute>} />
                  <Route path="account" element={<Account />} />
                  <Route path="audit" element={<ProtectedRoute roles={ROLE_GROUPS.AUDIT}><Audit /></ProtectedRoute>} />
                </Route>
              </Routes>
            </Suspense>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
