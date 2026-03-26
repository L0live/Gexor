// ============================================================================
// Gexor Cache Service — Lightweight in-memory L1 cache
//
// The backend (PostgreSQL) is the persistent L2 cache.
// This module provides a fast in-memory layer to avoid unnecessary
// network round-trips for entities already loaded in this session.
// ============================================================================

// Short TTL — the backend is the source of truth
const TTL = {
  wikidata: 10 * 60 * 1000,        // 10 minutes
  cultural: 30 * 60 * 1000,         // 30 minutes
  geographic: 60 * 60 * 1000,       // 1 hour
  default: 10 * 60 * 1000,          // 10 minutes
};

// ── In-memory cache ────────────────────────────────────────────────────────
const _memCache = new Map();

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a cache key from endpoint + identifier.
 */
export const cacheKey = (endpoint, identifier) => `${endpoint}:${identifier}`;

/**
 * Get cached data (memory only).
 *
 * @param {string} key — Cache key
 * @returns {Promise<any|null>} — Cached data or null if miss/expired
 */
export const get = async (key) => {
  const entry = _memCache.get(key);
  if (entry) {
    if (Date.now() < entry.expiresAt) return entry.data;
    _memCache.delete(key);
  }
  return null;
};

/**
 * Store data in memory cache.
 *
 * @param {string} key — Cache key
 * @param {any} data — Data to cache
 * @param {string} [domain='default'] — TTL domain
 */
export const set = async (key, data, domain = 'default') => {
  const ttl = TTL[domain] || TTL.default;
  _memCache.set(key, { data, expiresAt: Date.now() + ttl });
};

/**
 * Invalidate a specific cache key.
 */
export const invalidate = async (key) => {
  _memCache.delete(key);
};

/**
 * Clear all caches.
 */
export const clearAll = async () => {
  _memCache.clear();
};

/**
 * Get memory cache stats.
 */
export const getStats = () => ({
  memoryEntries: _memCache.size,
});
