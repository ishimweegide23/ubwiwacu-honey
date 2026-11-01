import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// In development the API runs on :5000. Proxying /api and /uploads keeps the
// frontend same-origin, so no CORS setup is needed while developing.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_PROXY || 'http://localhost:5000'
  return {
    plugins: [react()],
    // Pre-bundle every dependency at startup. Without this, Vite discovers e.g. react-dom
    // only when a lazy page (quick view, admin search) first loads, re-optimizes mid-session,
    // and open tabs get "504 (Outdated Optimize Dep)" until a hard reload.
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-router-dom', 'lucide-react'],
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/uploads': { target, changeOrigin: true },
      },
    },
  }
})
