import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Invoice from '../components/Invoice.jsx'
import { ErrorState, Loading } from '../components/ui.jsx'
import { adminApi, shopApi } from '../lib/api.js'
import { useAsync, usePageMeta } from '../lib/useAsync.js'
import NotFound from './NotFound.jsx'

/** Customer invoice: /order/:orderNumber/invoice */
export function CustomerInvoice() {
  const { orderNumber } = useParams()
  usePageMeta(`Invoice ${orderNumber.toUpperCase()}`)
  const { data, error, loading, reload } = useAsync(() => shopApi.track(orderNumber), [orderNumber])
  if (loading && !data) return <Loading label="Loading invoice…" />
  if (error?.status === 404) return <NotFound title="Order not found" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  return (
    <section className="section--tight inv-page">
      <div className="container">
        <Invoice
          order={data}
          actions={
            <Link to={`/order/${data.order_number}`} className="link-arrow">
              <ArrowLeft size={16} /> Back to order
            </Link>
          }
        />
      </div>
    </section>
  )
}

/** Staff invoice: /admin/orders/:id/invoice (full customer details). */
export function AdminInvoice() {
  const { id } = useParams()
  const { data, error, loading, reload } = useAsync(() => adminApi.order(id), [id])
  if (loading && !data) return <Loading label="Loading invoice…" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  return (
    <Invoice
      order={data}
      actions={
        <Link to={`/admin/orders/${id}`} className="link-arrow">
          <ArrowLeft size={16} /> Back to order
        </Link>
      }
    />
  )
}

export default CustomerInvoice
