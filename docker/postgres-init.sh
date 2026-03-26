#!/bin/bash
# ============================================================================
# PostgreSQL initialization script — runs on first container start only
# ============================================================================
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Schema is also created by the backend on startup (initSchema),
    -- but this ensures it's ready before the backend connects.

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
EOSQL

echo "[docker-init] PostgreSQL schema initialized"
