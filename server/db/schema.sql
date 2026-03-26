-- ============================================================================
-- Gexor Backend — PostgreSQL Schema
-- ============================================================================
-- Run: psql gexor < server/db/schema.sql

-- Generic key-value cache with JSONB data and TTL expiration
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

-- Dedicated PID label cache (high-frequency lookups)
CREATE TABLE IF NOT EXISTS pid_labels (
  pid         TEXT PRIMARY KEY,
  label_fr    TEXT,
  label_en    TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedicated QID label cache (entity labels + descriptions)
CREATE TABLE IF NOT EXISTS qid_labels (
  qid         TEXT PRIMARY KEY,
  label_fr    TEXT,
  label_en    TEXT,
  description_fr TEXT,
  description_en TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
