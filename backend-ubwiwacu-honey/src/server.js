import { env } from './config/env.js';
import { closePool, testConnection } from './config/db.js';
import { logger } from './utils/logger.js';
import app from './app.js';
import { retryFailedReceipts } from './services/receipt.service.js';
import { isEmailConfigured } from './services/email.service.js';
import { startPushPoller } from './services/payment.service.js';

let server;
let retryTimer;

async function start() {
  try {
    const db = await testConnection();
    logger.info(`Connected to PostgreSQL database "${db.db}"`);
  } catch (err) {
    logger.error(`Cannot connect to PostgreSQL: ${err.message}`);
    process.exit(1);
  }

  if (!isEmailConfigured()) {
    logger.warn('Email is not configured (EMAIL_PASS empty). Receipts are still created; emails will be marked failed/pending.');
  }

  startPushPoller();
  server = app.listen(env.PORT, () => {
    logger.info(`Ubw'iwacu Honey API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  if (env.RECEIPT_RETRY_INTERVAL_MS > 0) {
    retryTimer = setInterval(() => {
      retryFailedReceipts().catch((err) => logger.error('Receipt retry job failed', { error: err.message }));
    }, env.RECEIPT_RETRY_INTERVAL_MS);
    retryTimer.unref();
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  if (retryTimer) clearInterval(retryTimer);

  const force = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  force.unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await closePool();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: err.message });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason.stack : String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.stack });
  shutdown('uncaughtException');
});

start();
