// ============================================================================
// Gexor — Wikidata API Client (thin wrapper over backend /api endpoints)
//
// All heavy lifting (batching, label resolution, rate limiting, caching)
// is now handled by the Fastify backend. This module provides the same
// public API surface to the rest of the frontend.
// ============================================================================

import { validateLodNode, validateLodEdge } from '../validators';

const WD = 'http://www.wikidata.org/entity/';

// ────────────────────────────────────────────────────────────────────────────
// QUERIES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Search entities by text on Wikidata.
 *
 * @param {string} text — Search query
 * @param {string} [lang='fr'] — Language
 * @param {number} [limit=15]
 * @returns {Promise<Array<{uri, label, description, aliases}>>}
 */
export const searchEntities = async (text, lang = 'fr', limit = 15) => {
  if (!text || text.trim().length < 2) return [];

  const url = `/api/search?q=${encodeURIComponent(text)}&lang=${lang}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Search failed: ${response.status}`);
  return await response.json();
};

/**
 * Fetch full node properties for a given Wikidata entity URI.
 * The backend handles all claim parsing, label resolution, and caching.
 *
 * @param {string} uri — Full Wikidata URI (e.g. http://www.wikidata.org/entity/Q7742)
 * @returns {Promise<import('../../models/lodNode').LodNode>}
 */
export const fetchNodeProperties = async (uri) => {
  const qid = uri.replace(WD, '');
  const response = await fetch(`/api/entity/${qid}`);
  if (!response.ok) throw new Error(`Entity fetch failed: ${response.status}`);
  const data = await response.json();
  validateLodNode(data, `fetchNodeProperties(${qid})`);
  return data;
};

/**
 * Fetch outgoing neighbors of a Wikidata entity.
 *
 * @param {string} uri — Entity URI
 * @param {number} [limit=50] — Max neighbors to return
 * @returns {Promise<{nodes: LodNode[], edges: LodEdge[]}>}
 */
export const fetchNeighbors = async (uri, limit = 50) => {
  const qid = uri.replace(WD, '');
  const response = await fetch(`/api/entity/${qid}/neighbors?direction=outgoing&limit=${limit}`);
  if (!response.ok) throw new Error(`Neighbor fetch failed: ${response.status}`);
  return await response.json();
};

/**
 * Fetch incoming neighbors (entities that reference the given entity).
 *
 * @param {string} uri — Entity URI
 * @param {number} [limit=50] — Max incoming neighbors to return
 * @returns {Promise<{nodes: LodNode[], edges: LodEdge[]}>}
 */
export const fetchIncomingNeighbors = async (uri, limit = 50) => {
  const qid = uri.replace(WD, '');
  const response = await fetch(`/api/entity/${qid}/neighbors?direction=incoming&limit=${limit}`);
  if (!response.ok) throw new Error(`Incoming neighbor fetch failed: ${response.status}`);
  return await response.json();
};

/**
 * Combined fetch: entity properties + neighbors in a single round-trip.
 * Used by fetchAndExpandNode for maximum efficiency.
 *
 * @param {string} uri — Entity URI
 * @param {string} [direction='both'] — 'outgoing' | 'incoming' | 'both'
 * @param {number} [limit=50]
 * @returns {Promise<{node: LodNode, neighbors: {nodes: LodNode[], edges: LodEdge[], incomingEdgeIds: string[]}}>}
 */
export const fetchEntityExpand = async (uri, direction = 'both', limit = 50) => {
  const qid = uri.replace(WD, '');
  const response = await fetch(`/api/entity/${qid}/expand?direction=${direction}&limit=${limit}`);
  if (!response.ok) throw new Error(`Entity expand failed: ${response.status}`);
  const data = await response.json();
  validateLodNode(data?.node, `fetchEntityExpand.node(${qid})`);
  const neighbors = data?.neighbors?.nodes || [];
  neighbors.forEach((n, i) => validateLodNode(n, `fetchEntityExpand.neighbor[${i}](${qid})`));
  (data?.neighbors?.edges || []).forEach((e, i) => validateLodEdge(e, `fetchEntityExpand.edge[${i}](${qid})`));
  return data;
};

/**
 * Fetch incoming neighbor aggregates — grouped by (PID, P31 type, count).
 * Replaces the flat fetchIncomingNeighbors for aggregate display.
 *
 * @param {string} uri — Entity URI
 * @param {number} [limit=100]
 * @returns {Promise<{aggregates: Array<{predicate, predicateLabel, targetClasses, targetClassLabels, count}>}>}
 */
export const fetchIncomingAggregates = async (uri, limit = 100) => {
  const qid = uri.replace(WD, '');
  const response = await fetch(`/api/entity/${qid}/incoming-aggregates?limit=${limit}`);
  if (!response.ok) throw new Error(`Incoming aggregates failed: ${response.status}`);
  return await response.json();
};

/**
 * Fetch individual children of an aggregate (expand on demand).
 *
 * @param {string} uri — Target entity URI (the one being pointed at)
 * @param {string} pid — Predicate PID
 * @param {string} targetTypeQid — P31 type QID to filter by
 * @param {number} [limit=50]
 * @returns {Promise<{nodes: LodNode[], edges: LodEdge[]}>}
 */
export const fetchAggregateChildren = async (uri, pid, targetTypeQid, limit = 50) => {
  const qid = uri.replace(WD, '');
  // targetTypeQid is no longer strictly used for filtering in backend, but kept for signature compatibility
  const typeParam = targetTypeQid ? `&type=${targetTypeQid}` : '';
  const response = await fetch(`/api/entity/${qid}/aggregate-children?pids=${pid}${typeParam}&limit=${limit}`);
  if (!response.ok) throw new Error(`Aggregate children fetch failed: ${response.status}`);
  return await response.json();
};

/**
 * Find entities semantically similar to a given node by counting shared
 * D_always_primary property-value pairs.
 *
 * Strategy: one lightweight SPARQL query per D_always_primary PID found in
 * the node's properties (wikibase-item values only), all run in parallel via
 * Promise.allSettled. Results are merged client-side: sharedCount = number of
 * distinct PIDs for which at least one value matched.
 *
 * Per-property queries use the specific wdt:Pxxx predicate index, which is
 * orders of magnitude faster than a generic ?p ?v join over all pairs.
 *
 * @param {string} uri — The reference entity URI
 * @param {Object} properties — The node's properties object from the store (LodNode.properties)
 * @param {string} [lang='fr']
 * @param {number} [limit=25]
 * @returns {Promise<Array<{uri: string, label: string, sharedCount: number}>>}
 */
export const fetchSimilarByProperties = async (uri, properties, lang = 'fr', limit = 25) => {
  const qid = uri.replace(WD, '');

  const { getAlwaysPrimaryPids } = await import('../propertyClassification.js');
  const alwaysPrimary = getAlwaysPrimaryPids();

  // Group QID values by D_always_primary PID
  const pidGroups = {};
  for (const [pid, prop] of Object.entries(properties || {})) {
    if (!alwaysPrimary.has(pid)) continue;
    const qids = [];
    for (const v of prop.values || []) {
      const valueQid = v.value?.startsWith?.('http') ? v.value.replace(WD, '') : v.value;
      if (valueQid && /^Q\d+$/.test(valueQid)) qids.push(valueQid);
    }
    if (qids.length > 0) pidGroups[pid] = qids;
  }

  const pids = Object.keys(pidGroups);
  if (pids.length === 0) return [];

  // One query per PID: uses the specific wdt:Pxxx index → fast, no timeout risk
  const queryResults = await Promise.allSettled(
    pids.map(pid => {
      const valuesList = pidGroups[pid].map(q => `wd:${q}`).join(' ');
      const query = `SELECT ?entity ?entityLabel WHERE {
  VALUES ?v { ${valuesList} }
  ?entity wdt:${pid} ?v .
  FILTER(?entity != wd:${qid})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en". }
}
LIMIT ${limit * 3}`;

      return fetch('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, timeout: 15000 }),
      })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(data => data?.results?.bindings || data?.bindings || []);
    })
  );

  // Merge: sharedCount = number of distinct PIDs where the entity appeared
  const entityMap = new Map(); // uri -> { label, sharedCount }
  for (const result of queryResults) {
    if (result.status !== 'fulfilled') continue;
    for (const b of result.value) {
      const entityUri = b.entity?.value || '';
      if (!entityUri.includes('/entity/Q')) continue;
      const label = b.entityLabel?.value || entityUri.replace(`${WD}`, '') || '?';
      const prev = entityMap.get(entityUri);
      if (prev) {
        prev.sharedCount += 1;
        // Prefer resolved label over raw QID fallback
        if (prev.label.match(/^Q\d+$/) && !label.match(/^Q\d+$/)) prev.label = label;
      } else {
        entityMap.set(entityUri, { label, sharedCount: 1 });
      }
    }
  }

  return [...entityMap.entries()]
    .map(([uri, { label, sharedCount }]) => ({ uri, label, sharedCount }))
    .sort((a, b) => b.sharedCount - a.sharedCount)
    .slice(0, limit);
};
