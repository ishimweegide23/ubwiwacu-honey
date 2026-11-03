import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { HoneyJar } from '../components/Brand.jsx'
import { usePageMeta } from '../lib/useAsync.js'

export default function NotFound({ title = 'Page not found', message = 'The page you are looking for has moved or does not exist.' }) {
  usePageMeta(title)
  return (
    <section className="section">
      <div className="container center" style={{ maxWidth: 560 }}>
        <div style={{ width: 120, margin: '0 auto 24px' }}>
          <HoneyJar label="404" />
        </div>
        <h1 style={{ fontSize: '2.4rem' }}>{title}</h1>
        <p className="muted">{message}</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
          <Link to="/" className="btn btn--outline">
            Go home
          </Link>
          <Link to="/shop" className="btn btn--primary">
            Shop honey <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}
