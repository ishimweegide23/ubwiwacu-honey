import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import { testConnection } from './config/db.js';
import { httpLogStream } from './utils/logger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { notFound } from './middleware/notFound.middleware.js';
import apiRoutes from './routes/index.js';

const app = express();

app.disable('x-powered-by');
if (env.TRUST_PROXY) app.set('trust proxy', 1);

// Product images and receipt PDFs are loaded cross-origin by the frontend.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser clients (curl, Postman, gateway webhooks) that send no Origin.
      if (!origin || env.CLIENT_URLS.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Gateway-Signature'],
    exposedHeaders: ['Content-Disposition', 'RateLimit', 'RateLimit-Policy'],
    maxAge: 600,
  }),
);

// Keep the raw body for webhook signature verification.
app.use(
  express.json({
    limit: '200kb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: '200kb' }));

app.use(morgan(env.isProd ? 'combined' : 'dev', { stream: httpLogStream }));

// Uploaded product photos (public).
app.use(
  '/uploads/products',
  express.static(env.UPLOAD_STORAGE, { maxAge: '7d', index: false, dotfiles: 'ignore', fallthrough: true }),
);

app.get('/api/health', async (req, res) => {
  try {
    const db = await testConnection();
    res.json({
      success: true,
      data: { status: 'ok', db: 'connected', time: db.now, env: env.NODE_ENV },
    });
  } catch {
    res.status(503).json({ success: false, message: 'Database unavailable', data: { status: 'degraded', db: 'disconnected' } });
  }
});

app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
