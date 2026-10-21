import pg from 'pg';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const { Pool, types } = pg;

// BIGINT (COUNT/SUM results) -> JS number. Our money values are integers well below 2^53.
types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10)));
// NUMERIC -> JS number (used by AVG / ROUND in analytics).
types.setTypeParser(1700, (v) => (v === null ? null : Number.parseFloat(v)));

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

/** Run a single query on the pool. */
export const query = (text, params = []) => pool.query(text, params);

/**
 * Run `fn(client)` inside BEGIN/COMMIT. Any throw rolls back.
 * Every multi-step write in the services goes through here.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('Rollback failed', { error: rollbackErr.message });
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Atomically increment a counter row in app_meta and return the new value.
 * The UPDATE takes a row lock, so concurrent transactions are serialised and
 * never receive the same number. Must be called with a transaction client.
 */
export async function getNextCounter(client, key) {
  const { rows } = await client.query(
    `UPDATE app_meta
        SET value = jsonb_build_object('value', COALESCE((value->>'value')::int, 0) + 1),
            updated_at = now()
      WHERE key = $1
      RETURNING (value->>'value')::int AS next`,
    [key],
  );
  if (rows.length) return rows[0].next;

  // Counter row missing (fresh DB): create it. ON CONFLICT handles a concurrent creator.
  const inserted = await client.query(
    `INSERT INTO app_meta (key, value) VALUES ($1, '{"value": 1}'::jsonb)
     ON CONFLICT (key) DO UPDATE
       SET value = jsonb_build_object('value', COALESCE((app_meta.value->>'value')::int, 0) + 1),
           updated_at = now()
     RETURNING (value->>'value')::int AS next`,
    [key],
  );
  return inserted.rows[0].next;
}

export async function testConnection() {
  const { rows } = await pool.query('SELECT now() AS now, current_database() AS db');
  return rows[0];
}

export async function closePool() {
  await pool.end();
}
