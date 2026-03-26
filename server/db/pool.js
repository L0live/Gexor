// ============================================================================
// Gexor Backend — PostgreSQL Connection Pool
// ============================================================================

import pg from 'pg';
import config from '../config.js';

const { Pool } = pg;

const poolConfig = config.database.connectionString
  ? { connectionString: config.database.connectionString, max: config.database.max }
  : {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      ...(config.database.password ? { password: config.database.password } : {}),
      max: config.database.max,
      idleTimeoutMillis: config.database.idleTimeoutMillis,
    };

const pool = new Pool(poolConfig);

// Log connection errors (don't crash)
pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

/**
 * Run a query against the database.
 * @param {string} text — SQL query
 * @param {any[]} params — Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
export const query = (text, params) => pool.query(text, params);

/**
 * Get a client from the pool (for transactions).
 */
export const getClient = () => pool.connect();

/**
 * Initialize the database schema if it doesn't exist.
 */
export const initSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key         TEXT PRIMARY KEY,
        data        JSONB NOT NULL,
        domain      TEXT NOT NULL DEFAULT 'default',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at  TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cache_entries_expires
        ON cache_entries (expires_at);

      CREATE INDEX IF NOT EXISTS idx_cache_entries_domain
        ON cache_entries (domain);

      CREATE TABLE IF NOT EXISTS pid_labels (
        pid         TEXT PRIMARY KEY,
        label_fr    TEXT,
        label_en    TEXT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS qid_labels (
        qid         TEXT PRIMARY KEY,
        label_fr    TEXT,
        label_en    TEXT,
        description_fr TEXT,
        description_en TEXT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[db] Schema initialized');
  } catch (err) {
    console.error('[db] Schema initialization failed:', err.message);
    throw err;
  }
};

/**
 * Clean up expired cache entries.
 */
export const cleanExpired = async () => {
  try {
    const result = await pool.query(
      'DELETE FROM cache_entries WHERE expires_at < NOW()'
    );
    if (result.rowCount > 0) {
      console.log(`[db] Cleaned ${result.rowCount} expired cache entries`);
    }
  } catch (err) {
    console.warn('[db] Failed to clean expired entries:', err.message);
  }
};

/**
 * Gracefully close the pool.
 */
export const close = () => pool.end();

export default pool;
