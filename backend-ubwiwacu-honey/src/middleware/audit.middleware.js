import { query } from '../config/db.js';
import { logger } from '../utils/logger.js';

/** Client IP (respects TRUST_PROXY via Express' req.ip). */
export function clientIp(req) {
  return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64) || null;
}

/**
 * Attaches req.actor = { userId, role, ip }. Controllers pass req.actor to services,
 * which write audit_logs INSIDE their own transaction (so the log and the change
 * commit or roll back together). Services never see req itself.
 */
export function auditContext(req, res, next) {
  req.actor = {
    userId: req.user?.id ?? null,
    role: req.user?.role ?? null,
    ip: clientIp(req),
  };
  next();
}

/**
 * Insert one audit_logs row.
 * @param executor  a pg client (inside a transaction) or null to use the pool
 */
export async function recordAudit(executor, { actor, action, recordType = null, recordId = null, details = null }) {
  const run = executor ? executor.query.bind(executor) : query;
  await run(
    `INSERT INTO audit_logs (user_id, action, record_type, record_id, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      actor?.userId ?? null,
      action,
      recordType,
      recordId,
      details === null ? null : JSON.stringify(details),
      actor?.ip ?? null,
    ],
  );
}

/** Fire-and-forget audit for events outside a transaction (e.g. failed logins). */
export function recordAuditSafe(entry) {
  recordAudit(null, entry).catch((err) =>
    logger.error('Failed to write audit log', { error: err.message, action: entry.action }),
  );
}

export default auditContext;
