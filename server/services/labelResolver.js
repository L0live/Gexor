// ============================================================================
// Gexor Backend — Label Resolver (PID & QID labels with PostgreSQL cache)
// ============================================================================

import { query } from '../db/pool.js';
import { throttledFetch } from './wikidataClient.js';
import config from '../config.js';

const { actionApi, batchSize } = config.wikidata;

// ── In-memory session cache (fast L1, avoids repeated DB queries) ──────────
const _pidMemCache = new Map();
const _qidMemCache = new Map();

// ────────────────────────────────────────────────────────────────────────────
// PID Labels
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve PID labels. Returns a map { pid → label }.
 * Checks: memory → PostgreSQL → Wikidata API (batch of 50).
 *
 * @param {string[]} pids — e.g. ['P31', 'P40', 'P569']
 * @returns {Promise<Record<string, string>>}
 */
export const resolvePidLabels = async (pids) => {
  if (!pids || pids.length === 0) return {};

  const result = {};
  const toFetchFromDb = [];

  // 1. Memory cache
  for (const pid of pids) {
    const cached = _pidMemCache.get(pid);
    if (cached) {
      result[pid] = cached;
    } else {
      toFetchFromDb.push(pid);
    }
  }

  if (toFetchFromDb.length === 0) return result;

  // 2. PostgreSQL
  const toFetchFromApi = [];
  try {
    const dbResult = await query(
      'SELECT pid, label_fr, label_en FROM pid_labels WHERE pid = ANY($1)',
      [toFetchFromDb]
    );
    const dbMap = new Map(dbResult.rows.map(r => [r.pid, r]));

    for (const pid of toFetchFromDb) {
      const row = dbMap.get(pid);
      if (row) {
        const label = row.label_fr || row.label_en || pid;
        result[pid] = label;
        _pidMemCache.set(pid, label);
      } else {
        toFetchFromApi.push(pid);
      }
    }
  } catch (err) {
    console.warn('[labelResolver] PID DB lookup failed:', err.message);
    toFetchFromApi.push(...toFetchFromDb);
  }

  if (toFetchFromApi.length === 0) return result;

  // 3. Wikidata API (batched)
  for (let i = 0; i < toFetchFromApi.length; i += batchSize) {
    const batch = toFetchFromApi.slice(i, i + batchSize);
    try {
      const url = `${actionApi}?action=wbgetentities&ids=${batch.join('|')}` +
        `&props=labels&languages=fr|en&format=json&origin=*`;
      const resp = await throttledFetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();

      const inserts = [];
      for (const pid of batch) {
        const ent = data.entities?.[pid];
        const labelFr = ent?.labels?.fr?.value || null;
        const labelEn = ent?.labels?.en?.value || null;
        const label = labelFr || labelEn || pid;
        result[pid] = label;
        _pidMemCache.set(pid, label);
        inserts.push({ pid, labelFr, labelEn });
      }

      // Persist to PostgreSQL
      if (inserts.length > 0) {
        const values = inserts.map((_, i) =>
          `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, NOW())`
        ).join(', ');
        const params = inserts.flatMap(({ pid, labelFr, labelEn }) => [pid, labelFr, labelEn]);
        try {
          await query(
            `INSERT INTO pid_labels (pid, label_fr, label_en, updated_at)
             VALUES ${values}
             ON CONFLICT (pid) DO UPDATE
               SET label_fr = EXCLUDED.label_fr,
                   label_en = EXCLUDED.label_en,
                   updated_at = NOW()`,
            params
          );
        } catch { /* non-critical */ }
      }
    } catch (err) {
      console.warn('[labelResolver] PID API fetch failed:', err.message);
      // Fallback: use raw PIDs
      for (const pid of batch) {
        if (!result[pid]) result[pid] = pid;
      }
    }
  }

  return result;
};

/**
 * Get a single PID label (from memory cache or raw fallback).
 */
export const getPidLabel = (pid) => _pidMemCache.get(pid) || pid;

// ────────────────────────────────────────────────────────────────────────────
// QID Labels
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve QID labels and descriptions. Returns a map { qid → { label, description } }.
 *
 * @param {string[]} qids — e.g. ['Q42', 'Q7742']
 * @returns {Promise<Record<string, {label: string, description: string}>>}
 */
export const resolveQidLabels = async (qids) => {
  if (!qids || qids.length === 0) return {};

  const result = {};
  const toFetchFromDb = [];

  // 1. Memory cache
  for (const qid of qids) {
    const cached = _qidMemCache.get(qid);
    if (cached) {
      result[qid] = cached;
    } else {
      toFetchFromDb.push(qid);
    }
  }

  if (toFetchFromDb.length === 0) return result;

  // 2. PostgreSQL
  const toFetchFromApi = [];
  try {
    const dbResult = await query(
      'SELECT qid, label_fr, label_en, description_fr, description_en FROM qid_labels WHERE qid = ANY($1)',
      [toFetchFromDb]
    );
    const dbMap = new Map(dbResult.rows.map(r => [r.qid, r]));

    for (const qid of toFetchFromDb) {
      const row = dbMap.get(qid);
      if (row) {
        const entry = {
          label: row.label_fr || row.label_en || qid,
          description: row.description_fr || row.description_en || '',
        };
        result[qid] = entry;
        _qidMemCache.set(qid, entry);
      } else {
        toFetchFromApi.push(qid);
      }
    }
  } catch (err) {
    console.warn('[labelResolver] QID DB lookup failed:', err.message);
    toFetchFromApi.push(...toFetchFromDb);
  }

  if (toFetchFromApi.length === 0) return result;

  // 3. Wikidata API (batched)
  for (let i = 0; i < toFetchFromApi.length; i += batchSize) {
    const batch = toFetchFromApi.slice(i, i + batchSize);
    try {
      const url = `${actionApi}?action=wbgetentities&ids=${batch.join('|')}` +
        `&props=labels|descriptions&languages=fr|en&format=json&origin=*`;
      const resp = await throttledFetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();

      const inserts = [];
      for (const qid of batch) {
        const ent = data.entities?.[qid];
        const labelFr = ent?.labels?.fr?.value || null;
        const labelEn = ent?.labels?.en?.value || null;
        const descFr = ent?.descriptions?.fr?.value || null;
        const descEn = ent?.descriptions?.en?.value || null;
        const entry = {
          label: labelFr || labelEn || qid,
          description: descFr || descEn || '',
        };
        result[qid] = entry;
        _qidMemCache.set(qid, entry);
        inserts.push({ qid, labelFr, labelEn, descFr, descEn });
      }

      // Persist to PostgreSQL
      if (inserts.length > 0) {
        const values = inserts.map((_, i) =>
          `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5}, NOW())`
        ).join(', ');
        const params = inserts.flatMap(({ qid, labelFr, labelEn, descFr, descEn }) =>
          [qid, labelFr, labelEn, descFr, descEn]
        );
        try {
          await query(
            `INSERT INTO qid_labels (qid, label_fr, label_en, description_fr, description_en, updated_at)
             VALUES ${values}
             ON CONFLICT (qid) DO UPDATE
               SET label_fr = EXCLUDED.label_fr,
                   label_en = EXCLUDED.label_en,
                   description_fr = EXCLUDED.description_fr,
                   description_en = EXCLUDED.description_en,
                   updated_at = NOW()`,
            params
          );
        } catch { /* non-critical */ }
      }
    } catch (err) {
      console.warn('[labelResolver] QID API fetch failed:', err.message);
      for (const qid of batch) {
        if (!result[qid]) result[qid] = { label: qid, description: '' };
      }
    }
  }

  return result;
};

/**
 * Get a single QID label (from memory cache or raw fallback).
 */
export const getQidLabel = (qid) => _qidMemCache.get(qid)?.label || qid;
