// ============================================================================
// Gexor Backend — Cache Service (PostgreSQL-backed)
// ============================================================================

import { query } from '../db/pool.js';
import config from '../config.js';

/**
 * Get cached data by key. Returns null if not found or expired.
 *
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export const get = async (key) => {
  try {
    const result = await query(
      'SELECT data FROM cache_entries WHERE key = $1 AND expires_at > NOW()',
      [key]
    );
    return result.rows.length > 0 ? result.rows[0].data : null;
  } catch (err) {
    console.warn('[cache] get failed:', err.message);
    return null;
  }
};

/**
 * Store data in cache with TTL based on domain.
 *
 * @param {string} key
 * @param {any} data — Must be JSON-serializable
 * @param {string} [domain='default']
 */
export const set = async (key, data, domain = 'default') => {
  const ttlMs = config.cacheTtl[domain] || config.cacheTtl.default;
  try {
    await query(
      `INSERT INTO cache_entries (key, data, domain, created_at, expires_at)
       VALUES ($1, $2, $3, NOW(), NOW() + $4::interval)
       ON CONFLICT (key) DO UPDATE
         SET data = EXCLUDED.data,
             domain = EXCLUDED.domain,
             created_at = NOW(),
             expires_at = NOW() + $4::interval`,
      [key, JSON.stringify(data), domain, `${ttlMs} milliseconds`]
    );
  } catch (err) {
    console.warn('[cache] set failed:', err.message);
  }
};

/**
 * Invalidate a specific cache key.
 *
 * @param {string} key
 */
export const invalidate = async (key) => {
  try {
    await query('DELETE FROM cache_entries WHERE key = $1', [key]);
  } catch (err) {
    console.warn('[cache] invalidate failed:', err.message);
  }
};

/**
 * Generate a cache key.
 *
 * @param {string} prefix — e.g. 'entity', 'neighbors'
 * @param {string} identifier — e.g. 'Q7742'
 * @returns {string}
 */
export const cacheKey = (prefix, identifier) => `${prefix}:${identifier}`;
