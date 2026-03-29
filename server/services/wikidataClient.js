// ============================================================================
// Gexor Backend — Wikidata Client Service
//
// Server-side equivalent of the frontend's wikidata.js.
// Consolidates all N+1 API calls into efficient batched operations,
// with PostgreSQL-backed label caching.
// ============================================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from '../config.js';
import { resolvePidLabels, getPidLabel, resolveQidLabels } from './labelResolver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { actionApi, sparqlEndpoint, userAgent, minIntervalMs, defaultTimeout, batchSize } = config.wikidata;

const WD = 'http://www.wikidata.org/entity/';
const WDT = 'http://www.wikidata.org/prop/direct/';

// ── Rate-limited fetch (server-side) ──────────────────────────────────────

let _lastFetchTime = 0;

/**
 * Fetch with rate-limiting and proper User-Agent.
 * Exported so labelResolver can use it.
 */
export const throttledFetch = async (url) => {
  const now = Date.now();
  const wait = minIntervalMs - (now - _lastFetchTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastFetchTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), defaultTimeout);

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return resp;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};

// ── Property classification (loaded from static JSON) ─────────────────────

let _classificationData = null;
let _alwaysPrimaryPids = null;
let _allSecondaryPids = null;
let _secondaryPidsByGroup = null;
let _contextDependentPids = null;
let _bNoisePids = null;

const _loadClassification = () => {
  if (_classificationData) return;
  const filePath = join(__dirname, '../../data/wikidata_properties.json');
  _classificationData = JSON.parse(readFileSync(filePath, 'utf-8'));
};

const _extractPids = (obj) => {
  if (!obj) return [];
  return Object.keys(obj).filter(k => /^P\d+$/.test(k));
};

const _getAlwaysPrimaryPids = () => {
  if (_alwaysPrimaryPids) return _alwaysPrimaryPids;
  _loadClassification();
  const props = _classificationData.D_always_primary?.properties || {};
  _alwaysPrimaryPids = new Set(_extractPids(props));
  return _alwaysPrimaryPids;
};

const _getAllSecondaryPids = () => {
  if (_allSecondaryPids) return _allSecondaryPids;
  _loadClassification();
  const result = new Set();
  const aGroups = _classificationData.A_redundancy_groups || {};
  for (const [key, group] of Object.entries(aGroups)) {
    if (key.startsWith('_')) continue;
    _extractPids(group.properties || {}).forEach(pid => result.add(pid));
  }
  const bGroups = _classificationData.B_noise_compact_ui || {};
  for (const [key, group] of Object.entries(bGroups)) {
    if (key.startsWith('_')) continue;
    _extractPids(group.properties || {}).forEach(pid => result.add(pid));
    if (group.exemples_canoniques) {
      _extractPids(group.exemples_canoniques).forEach(pid => result.add(pid));
    }
  }
  _allSecondaryPids = result;
  return _allSecondaryPids;
};

const _getContextDependentPids = () => {
  if (_contextDependentPids) return _contextDependentPids;
  _loadClassification();
  const props = _classificationData.C_context_dependent?.properties || {};
  _contextDependentPids = new Set(_extractPids(props));
  return _contextDependentPids;
};

const _getBNoisePids = () => {
  if (_bNoisePids) return _bNoisePids;
  _loadClassification();
  _bNoisePids = new Set();
  const bGroups = _classificationData.B_noise_compact_ui || {};
  for (const [key, group] of Object.entries(bGroups)) {
    if (key.startsWith('_')) continue;
    _extractPids(group.properties || {}).forEach(pid => _bNoisePids.add(pid));
    if (group.exemples_canoniques) {
      _extractPids(group.exemples_canoniques).forEach(pid => _bNoisePids.add(pid));
    }
  }
  return _bNoisePids;
};

const _getSecondaryPidsByGroup = () => {
  if (_secondaryPidsByGroup) return _secondaryPidsByGroup;
  _loadClassification();
  const result = new Map();
  const aGroups = _classificationData.A_redundancy_groups || {};
  for (const [key, group] of Object.entries(aGroups)) {
    if (key.startsWith('_')) continue;
    result.set(key, { pids: new Set(_extractPids(group.properties || {})) });
  }
  const bGroups = _classificationData.B_noise_compact_ui || {};
  for (const [key, group] of Object.entries(bGroups)) {
    if (key.startsWith('_')) continue;
    const pids = new Set(_extractPids(group.properties || {}));
    if (group.exemples_canoniques) {
      _extractPids(group.exemples_canoniques).forEach(pid => pids.add(pid));
    }
    result.set(key, { pids });
  }
  _secondaryPidsByGroup = result;
  return _secondaryPidsByGroup;
};

export const classifyPid = (pid) => {
  if (_getAlwaysPrimaryPids().has(pid)) return 'primary';
  if (_getContextDependentPids().has(pid)) return 'context-dependent';
  if (_getAllSecondaryPids().has(pid)) return 'secondary';
  return 'unclassified';
};

export const getSecondaryGroupForPid = (pid) => {
  for (const [groupKey, groupData] of _getSecondaryPidsByGroup()) {
    if (groupData.pids.has(pid)) return groupKey;
  }
  return null;
};

// ── Wikimedia noise types (P31 values to filter out) ──────────────────────

const WIKIMEDIA_NOISE_TYPES = new Set([
  'Q4167836',   // Wikimedia category page
  'Q4167410',   // Wikimedia disambiguation page
  'Q11266439',  // Wikimedia template
  'Q13406463',  // Wikimedia list article
  'Q17442446',  // Wikimedia internal item
  'Q15184295',  // Wikimedia module
  'Q17633526',  // Wikinews article
]);

/**
 * Check if a set of P31 types contains only Wikimedia noise types.
 * @param {string[]} types — P31 QIDs
 * @returns {boolean}
 */
const _isWikimediaNoise = (types) => {
  if (!types || types.length === 0) return false;
  return types.every(t => WIKIMEDIA_NOISE_TYPES.has(t));
};

// ── Redundancy deduplication (A-axis) ─────────────────────────────────────

let _redundancyPidLookup = null;

/**
 * Build PID → redundancy group lookup with priority from _hierarchy.
 */
const _buildRedundancyPidLookup = () => {
  if (_redundancyPidLookup) return _redundancyPidLookup;
  _loadClassification();
  _redundancyPidLookup = new Map();
  const aGroups = _classificationData.A_redundancy_groups || {};
  for (const [groupKey, group] of Object.entries(aGroups)) {
    if (groupKey.startsWith('_')) continue;
    const hierarchyPids = [];
    if (group._hierarchy) {
      const parts = group._hierarchy.split('→').map(s => s.trim());
      for (const part of parts) {
        const pids = part.match(/P\d+/g);
        if (pids) hierarchyPids.push(...pids);
      }
    }
    const keepPids = new Set();
    if (group._keep_as_primary) {
      const found = group._keep_as_primary.match(/P\d+/g);
      if (found) found.forEach(p => keepPids.add(p));
    }
    const props = group.properties || {};
    for (const pid of _extractPids(props)) {
      const hIndex = hierarchyPids.indexOf(pid);
      _redundancyPidLookup.set(pid, {
        groupKey,
        label: group._label || groupKey,
        isPreferred: keepPids.has(pid),
        priority: hIndex >= 0 ? hIndex : 99,
      });
    }
  }
  return _redundancyPidLookup;
};

/**
 * Deduplicate PIDs within redundancy groups.
 * For each A-group with multiple PIDs present, keep only the most specific one.
 *
 * @param {Set<string>} pidSet — PIDs present in the entity's claims
 * @param {Set<string>} promotedPids — PIDs force-promoted by the Context Resolver
 * @returns {{ survivorsByGroup: Map<string, string>, demotedPids: Set<string> }}
 */
const _deduplicateRedundancyGroup = (pidSet, promotedPids = new Set()) => {
  const lookup = _buildRedundancyPidLookup();
  // Group present PIDs by their redundancy group
  const groupPids = new Map(); // groupKey → [{ pid, priority, isPreferred }]
  for (const pid of pidSet) {
    const info = lookup.get(pid);
    if (!info) continue;
    if (!groupPids.has(info.groupKey)) groupPids.set(info.groupKey, []);
    groupPids.get(info.groupKey).push({ pid, priority: info.priority, isPreferred: info.isPreferred });
  }

  const survivorsByGroup = new Map();
  const demotedPids = new Set();

  for (const [groupKey, pids] of groupPids) {
    if (pids.length <= 1) {
      if (pids.length === 1) survivorsByGroup.set(groupKey, pids[0].pid);
      continue;
    }
    // Sort: isPreferred first, then by priority ascending (most specific first)
    pids.sort((a, b) => {
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
      return a.priority - b.priority;
    });
    survivorsByGroup.set(groupKey, pids[0].pid);
    for (let i = 1; i < pids.length; i++) {
      // If promoted by Context Resolver, keep as primary
      if (!promotedPids.has(pids[i].pid)) {
        demotedPids.add(pids[i].pid);
      }
    }
  }

  return { survivorsByGroup, demotedPids };
};

// ── Properties handled by dedicated fields ────────────────────────────────

const SKIP_IN_PROPERTIES_DISPLAY = new Set([
  'P31', 'P18', 'P569', 'P570', 'P580', 'P582', 'P585', 'P625',
]);

const EXTERNAL_ID_PROPERTIES = ['P214', 'P268', 'P245', 'P1566', 'P227', 'P244', 'P349'];

// ── Date/URL helpers ──────────────────────────────────────────────────────

const _commonsThumbUrl = (fileUrl, width = 300) => {
  if (!fileUrl) return null;
  const filename = fileUrl.split('/').pop();
  if (!filename) return null;
  // Return a proxied URL for COEP compatibility
  const directUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${filename}?width=${width}`;
  return `/api/image?url=${encodeURIComponent(directUrl)}`;
};

const _parseDate = (val) => {
  if (!val) return null;
  const match = val.match(/^[+-]?(\d{4})-?(\d{2})?-?(\d{2})?/);
  if (match) {
    const [, year, month, day] = match;
    if (month && day && month !== '00' && day !== '00') return `${year}-${month}-${day}`;
    if (month && month !== '00') return `${year}-${month}`;
    return year;
  }
  return val;
};

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════════════

/**
 * Search Wikidata entities by text.
 *
 * @param {string} text
 * @param {string} lang
 * @param {number} limit
 * @returns {Promise<Array<{uri, id, label, description, aliases}>>}
 */
export const searchEntities = async (text, lang = 'fr', limit = 15) => {
  if (!text || text.trim().length < 2) return [];

  const url = `${actionApi}?action=wbsearchentities` +
    `&search=${encodeURIComponent(text)}` +
    `&language=${lang}&limit=${limit}&format=json&origin=*`;

  const resp = await throttledFetch(url);
  if (!resp.ok) throw new Error(`Wikidata search failed: ${resp.status}`);
  const data = await resp.json();

  return (data.search || []).map(item => ({
    uri: item.concepturi || `${WD}${item.id}`,
    id: item.id,
    label: item.label || item.id,
    description: item.description || '',
    aliases: item.aliases || [],
  }));
};

/**
 * Fetch full node properties for a Wikidata entity.
 * Server-side: all label resolution happens in batch, then result is returned.
 *
 * @param {string} qid — e.g. 'Q7742'
 * @returns {Promise<LodNode>}
 */
export const fetchEntityProperties = async (qid) => {
  const uri = `${WD}${qid}`;

  // 1. Fetch entity data
  const url = `${actionApi}?action=wbgetentities&ids=${qid}` +
    `&props=labels|descriptions|aliases|claims|sitelinks` +
    `&languages=fr|en&format=json&origin=*`;

  const resp = await throttledFetch(url);
  if (!resp.ok) throw new Error(`Wikidata API failed: ${resp.status}`);
  const data = await resp.json();
  const entity = data.entities?.[qid];
  if (!entity) throw new Error(`Entity ${qid} not found`);

  // Parse label, description, aliases
  const label = entity.labels?.fr?.value || entity.labels?.en?.value || qid;
  const description = entity.descriptions?.fr?.value || entity.descriptions?.en?.value || '';
  const aliases = [
    ...(entity.aliases?.fr || []).map(a => a.value),
    ...(entity.aliases?.en || []).map(a => a.value),
  ];

  // Parse claims
  const claims = entity.claims || {};
  const types = [];
  let thumbnailUrl = null;
  const temporal = { start: null, end: null, birthDate: null, precision: null };
  const geo = { lat: null, lon: null };
  const properties = {};
  const externalIds = {};

  const _snakValue = (snak) => snak?.mainsnak?.datavalue?.value;
  const _snakType = (snak) => snak?.mainsnak?.datavalue?.type;

  const allPids = new Set();

  for (const [pid, claimArray] of Object.entries(claims)) {
    allPids.add(pid);

    for (const claim of claimArray) {
      const val = _snakValue(claim);
      const valType = _snakType(claim);
      const datatype = claim?.mainsnak?.datatype;
      if (val === undefined) continue;

      if (pid === 'P31' && valType === 'wikibase-entityid') {
        types.push(val.id || `Q${val['numeric-id']}`);
      } else if (pid === 'P18' && typeof val === 'string') {
        thumbnailUrl = _commonsThumbUrl(`http://commons.wikimedia.org/wiki/Special:FilePath/${val}`);
      } else if (pid === 'P569' && valType === 'time') {
        temporal.birthDate = _parseDate(val.time);
        if (val.precision) temporal.precision = val.precision;
      } else if (pid === 'P580' && valType === 'time') {
        temporal.start = _parseDate(val.time);
        if (val.precision) temporal.precision = val.precision;
      } else if (['P570', 'P582'].includes(pid) && valType === 'time') {
        temporal.end = _parseDate(val.time);
      } else if (pid === 'P585' && valType === 'time') {
        if (!temporal.start) temporal.start = _parseDate(val.time);
      } else if (pid === 'P625' && valType === 'globecoordinate') {
        geo.lat = val.latitude;
        geo.lon = val.longitude;
      }

      if (EXTERNAL_ID_PROPERTIES.includes(pid) && typeof val === 'string') {
        externalIds[pid] = val;
      }

      if (!SKIP_IN_PROPERTIES_DISPLAY.has(pid)) {
        if (!properties[pid]) {
          properties[pid] = { label: pid, values: [], sources: [], datatype: datatype || 'string' };
        }
        const isEntity = datatype === 'wikibase-item';
        let displayVal;
        let unitQid = null;
        if (isEntity) {
          displayVal = val.id || `Q${val['numeric-id']}`;
        } else if (valType === 'time') {
          displayVal = _parseDate(val.time) || String(val);
        } else if (valType === 'quantity') {
          displayVal = val.amount ? val.amount.replace(/^\+/, '') : String(val);
          if (val.unit && val.unit !== '1') {
            unitQid = val.unit.replace('http://www.wikidata.org/entity/', '');
            displayVal += ` ${unitQid}`;
          }
        } else {
          displayVal = typeof val === 'string' ? val : (val.text || String(val));
        }
        properties[pid].values.push({ value: displayVal, label: displayVal, isEntity, datatype: datatype || 'string', unitQid });
      }
    }
  }

  // 2. Batch-resolve all labels in parallel
  const entityQidsToResolve = new Set();
  for (const prop of Object.values(properties)) {
    for (const v of prop.values) {
      if (v.isEntity && /^Q\d+$/.test(v.value)) entityQidsToResolve.add(v.value);
      if (v.unitQid && /^Q\d+$/.test(v.unitQid)) entityQidsToResolve.add(v.unitQid);
    }
  }

  // Fallback: birthDate fills start if no P580 was found
  if (temporal.birthDate && !temporal.start) temporal.start = temporal.birthDate;

  // Resolve PIDs, entity QIDs, and type QIDs concurrently
  const [pidLabels, entityLabels, typeLabels] = await Promise.all([
    resolvePidLabels(Array.from(allPids)),
    entityQidsToResolve.size > 0
      ? resolveQidLabels(Array.from(entityQidsToResolve))
      : {},
    types.length > 0
      ? resolveQidLabels(types)
      : {},
  ]);

  // Apply PID labels
  for (const pid of Object.keys(properties)) {
    properties[pid].label = pidLabels[pid] || pid;
  }

  // Apply entity-valued label resolution
  for (const prop of Object.values(properties)) {
    for (const v of prop.values) {
      if (v.isEntity && entityLabels[v.value]) {
        v.label = entityLabels[v.value].label;
      }
      if (v.unitQid && entityLabels[v.unitQid]) {
        v.label = v.label.replace(v.unitQid, entityLabels[v.unitQid].label);
        v.value = v.value.replace(v.unitQid, entityLabels[v.unitQid].label);
      }
    }
  }

  // Build type labels
  const resolvedTypeLabels = types.map(t => typeLabels[t]?.label || t);

  const source = {
    endpoint: 'wikidata',
    resourceUrl: uri,
    license: 'CC0',
    fetchedAt: new Date().toISOString(),
  };

  return {
    uri,
    label,
    types,
    typeLabels: resolvedTypeLabels,
    properties,
    temporal,
    geo,
    sources: [source],
    thumbnailUrl,
    externalIds,
    description,
    aliases,
  };
};

/**
 * Fetch outgoing neighbors (entity-valued claims) for a Wikidata entity.
 * Classify-first, limit-after strategy:
 *   1. Iterate ALL wikibase-item claims
 *   2. Classify each PID
 *   3. Apply redundancy deduplication (A-axis)
 *   4. Apply budget per tier (D→all, C promoted→all, unclassified→20, A dedup survivor→1, B noise→excluded)
 *
 * @param {string} qid
 * @param {number} limit — soft max for unclassified tier
 * @param {Set<string>} promotedPids — PIDs promoted by Context Resolver
 * @returns {Promise<{nodes: LodNode[], edges: LodEdge[]}>}
 */
export const fetchOutgoingNeighbors = async (qid, limit = 50, promotedPids = new Set()) => {
  const uri = `${WD}${qid}`;

  const url = `${actionApi}?action=wbgetentities&ids=${qid}&props=claims` +
    `&format=json&origin=*`;

  const resp = await throttledFetch(url);
  if (!resp.ok) throw new Error(`Wikidata API failed: ${resp.status}`);
  const data = await resp.json();
  const entity = data.entities?.[qid];
  if (!entity?.claims) return { nodes: [], edges: [] };

  const source = {
    endpoint: 'wikidata',
    resourceUrl: uri,
    license: 'CC0',
    fetchedAt: new Date().toISOString(),
  };

  // ── Step 1: Collect ALL entity-valued claims with classification ──────
  const allEdgesRaw = []; // { neighborQid, pid, rank, refCount, classification }
  const allPidsPresent = new Set();
  const noisePids = _getAllSecondaryPids(); // B noise PIDs

  for (const [pid, claimArray] of Object.entries(entity.claims)) {
    for (const claim of claimArray) {
      if (claim?.mainsnak?.datatype !== 'wikibase-item') continue;
      const val = claim?.mainsnak?.datavalue?.value;
      if (!val?.id) continue;
      const neighborQid = val.id;
      if (neighborQid === qid) continue;

      allPidsPresent.add(pid);
      const cls = classifyPid(pid);

      allEdgesRaw.push({
        neighborQid,
        pid,
        rank: claim.rank || 'normal',
        refCount: (claim.references || []).length,
        classification: cls,
      });
    }
  }

  if (allEdgesRaw.length === 0) return { nodes: [], edges: [] };

  // ── Step 2: Deduplicate redundancy groups (A-axis) ────────────────────
  const { demotedPids } = _deduplicateRedundancyGroup(allPidsPresent, promotedPids);

  // ── Step 3: Apply budget per tier ─────────────────────────────────────
  const budgetUnclassified = Math.min(limit, 20);
  let unclassifiedCount = 0;
  const filteredEdges = [];

  for (const edge of allEdgesRaw) {
    const cls = edge.classification;
    const pid = edge.pid;

    // B noise: excluded entirely (O(1) lookup via pre-computed Set)
    if (cls === 'secondary' && _getBNoisePids().has(pid)) {
      continue;
    }

    // Demoted by redundancy dedup: mark as secondary tier
    if (demotedPids.has(pid)) {
      edge.classification = 'secondary';
      edge._demotedByRedundancy = true;
      continue; // Don't include in graph edges by default
    }

    // D_always_primary: always included
    if (cls === 'primary') {
      filteredEdges.push(edge);
      continue;
    }

    // C context-dependent: include only if promoted, exclude otherwise
    if (cls === 'context-dependent') {
      if (promotedPids.has(pid)) {
        edge._contextPromoted = true;
        filteredEdges.push(edge);
      }
      continue;
    }

    // Unclassified: budget-limited
    if (cls === 'unclassified') {
      if (unclassifiedCount < budgetUnclassified) {
        unclassifiedCount++;
        filteredEdges.push(edge);
      }
      continue;
    }

    // Remaining secondary (A-axis survivors): include
    filteredEdges.push(edge);
  }

  if (filteredEdges.length === 0) return { nodes: [], edges: [] };

  // ── Step 4: Fetch neighbor info in batch ──────────────────────────────
  const neighborQids = new Set(filteredEdges.map(e => e.neighborQid));
  const edgePids = new Set(filteredEdges.map(e => e.pid));
  const qidArray = Array.from(neighborQids);
  const neighborInfoMap = {};

  for (let i = 0; i < qidArray.length; i += batchSize) {
    const batch = qidArray.slice(i, i + batchSize);
    try {
      const batchUrl = `${actionApi}?action=wbgetentities&ids=${batch.join('|')}` +
        `&props=labels|descriptions|claims&languages=fr|en&format=json&origin=*`;
      const batchResp = await throttledFetch(batchUrl);
      if (batchResp.ok) {
        const batchData = await batchResp.json();
        for (const [id, ent] of Object.entries(batchData.entities || {})) {
          const ntypes = [];
          for (const c of (ent.claims?.P31 || [])) {
            const v = c?.mainsnak?.datavalue?.value;
            if (v?.id) ntypes.push(v.id);
          }
          neighborInfoMap[id] = {
            label: ent.labels?.fr?.value || ent.labels?.en?.value || id,
            description: ent.descriptions?.fr?.value || ent.descriptions?.en?.value || '',
            types: ntypes,
            typeLabels: [],
          };
        }
      }
    } catch { /* use Q-IDs as fallback */ }
  }

  // ── Step 5: Filter out Wikimedia noise neighbors ──────────────────────
  const cleanEdges = filteredEdges.filter(e => {
    const info = neighborInfoMap[e.neighborQid];
    if (info && _isWikimediaNoise(info.types)) return false;
    return true;
  });

  // Resolve all type QIDs and edge PIDs concurrently
  const allTypeQids = new Set();
  for (const info of Object.values(neighborInfoMap)) {
    for (const t of info.types) allTypeQids.add(t);
  }

  const [typeLabelsMap, pidLabels] = await Promise.all([
    allTypeQids.size > 0 ? resolveQidLabels(Array.from(allTypeQids)) : {},
    resolvePidLabels(Array.from(edgePids)),
  ]);

  // Apply type labels
  for (const info of Object.values(neighborInfoMap)) {
    info.typeLabels = info.types.map(t => typeLabelsMap[t]?.label || t);
  }

  // Build nodes and edges
  const nodesMap = new Map();
  const edges = [];

  for (const raw of cleanEdges) {
    const neighborUri = `${WD}${raw.neighborQid}`;
    const info = neighborInfoMap[raw.neighborQid] || { label: raw.neighborQid, description: '', types: [], typeLabels: [] };

    if (!nodesMap.has(neighborUri)) {
      nodesMap.set(neighborUri, {
        uri: neighborUri,
        label: info.label,
        description: info.description,
        types: info.types,
        typeLabels: info.typeLabels,
        properties: {},
        temporal: { start: null, end: null, precision: null },
        geo: { lat: null, lon: null },
        sources: [source],
        thumbnailUrl: null,
        externalIds: {},
        aliases: [],
      });
    }

    const cls = raw._contextPromoted ? 'context-dependent' : raw.classification;

    edges.push({
      id: `${uri}-${raw.pid}-${neighborUri}`,
      source: uri,
      target: neighborUri,
      predicate: raw.pid,
      label: pidLabels[raw.pid] || raw.pid,
      sources: [source],
      rank: raw.rank,
      referenceCount: raw.refCount,
      classification: cls,
      redundancyGroup: getSecondaryGroupForPid(raw.pid),
      tier: (cls === 'primary' || raw._contextPromoted || cls === 'unclassified') ? 'primary' : 'secondary',
      direction: 'outgoing',
      contextPromoted: raw._contextPromoted || false,
      weight: cls === 'primary' ? 100 : (raw._contextPromoted ? 90 : (cls === 'unclassified' ? 70 : 30)),
    });
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
  };
};

/**
 * Fetch incoming neighbors via SPARQL.
 *
 * @param {string} qid
 * @param {number} limit
 * @returns {Promise<{nodes: LodNode[], edges: LodEdge[]}>}
 */
export const fetchIncomingNeighbors = async (qid, limit = 50) => {
  const uri = `${WD}${qid}`;

  const sparql = `
    SELECT ?subject ?subjectLabel ?subjectDescription ?pred ?predLabel
           (GROUP_CONCAT(DISTINCT ?typeId; SEPARATOR="|") AS ?types)
           (GROUP_CONCAT(DISTINCT ?typeLabel; SEPARATOR="|") AS ?typeLabels)
    WHERE {
      ?subject ?pred wd:${qid} .
      ?prop wikibase:directClaim ?pred .
      MINUS { ?prop wikibase:propertyType wikibase:ExternalId . }
      OPTIONAL {
        ?subject wdt:P31 ?typeId .
        ?typeId rdfs:label ?typeLabel . FILTER(LANG(?typeLabel) IN ("fr", "en"))
      }
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "fr,en" .
      }
    }
    GROUP BY ?subject ?subjectLabel ?subjectDescription ?pred ?predLabel
    LIMIT ${limit}
  `;

  const sparqlUrl = `${sparqlEndpoint}?query=${encodeURIComponent(sparql)}&format=json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let bindings;
  try {
    const resp = await fetch(sparqlUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': userAgent,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get('Retry-After') || '5', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      // Single retry
      const resp2 = await fetch(sparqlUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': userAgent,
        },
      });
      if (!resp2.ok) throw new Error(`SPARQL failed: ${resp2.status}`);
      const data2 = await resp2.json();
      bindings = data2?.results?.bindings || [];
    } else if (!resp.ok) {
      throw new Error(`SPARQL failed: ${resp.status}`);
    } else {
      const data = await resp.json();
      bindings = data?.results?.bindings || [];
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn(`[wikidataClient] SPARQL timeout for incoming neighbors of ${qid}`);
      return { nodes: [], edges: [] };
    }
    throw err;
  }

  if (!bindings || bindings.length === 0) return { nodes: [], edges: [] };

  const source = {
    endpoint: 'wikidata',
    resourceUrl: uri,
    license: 'CC0',
    fetchedAt: new Date().toISOString(),
  };

  const nodesMap = new Map();
  const edges = [];
  const pidSet = new Set();

  for (const b of bindings) {
    const subjectUri = b.subject?.value;
    const predUri = b.pred?.value;
    if (!subjectUri || !predUri) continue;

    const pid = predUri.replace(WDT, '');
    const subjectLabel = b.subjectLabel?.value || subjectUri.replace(WD, '');
    const subjectDesc = b.subjectDescription?.value || '';
    const predLabel = b.predLabel?.value || pid;
    const typeIds = b.types?.value ? b.types.value.split('|').map(t => t.replace(WD, '')) : [];
    const typeLabelsList = b.typeLabels?.value ? b.typeLabels.value.split('|') : [];

    pidSet.add(pid);

    if (!nodesMap.has(subjectUri)) {
      nodesMap.set(subjectUri, {
        uri: subjectUri,
        label: subjectLabel,
        description: subjectDesc,
        types: typeIds,
        typeLabels: typeLabelsList.length > 0 ? typeLabelsList : typeIds,
        properties: {},
        temporal: { start: null, end: null, precision: null },
        geo: { lat: null, lon: null },
        sources: [source],
        thumbnailUrl: null,
        externalIds: {},
        aliases: [],
      });
    }

    edges.push({
      id: `${subjectUri}-${pid}-${uri}`,
      source: subjectUri,
      target: uri,
      predicate: pid,
      label: predLabel,
      sources: [source],
      rank: 'normal',
      referenceCount: 0,
      classification: classifyPid(pid),
      redundancyGroup: getSecondaryGroupForPid(pid),
    });
  }

  // Resolve PID labels
  const pidLabels = await resolvePidLabels(Array.from(pidSet));
  for (const edge of edges) {
    const cached = pidLabels[edge.predicate];
    if (cached && cached !== edge.predicate) {
      edge.label = cached;
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
  };
};

/**
 * Fetch incoming neighbor aggregates via SPARQL — grouped by (PID, P31 type).
 * Instead of returning individual nodes, returns aggregate counts.
 *
 * @param {string} qid
 * @param {number} limit — max aggregate groups to return
 * @returns {Promise<{aggregates: Array<{predicate, predicateLabel, targetClasses, targetClassLabels, count}>}>}
 */
export const fetchIncomingAggregates = async (qid, limit = 100) => {
  const uri = `${WD}${qid}`;

  const sparql = `
    SELECT ?prop ?propLabel (COUNT(DISTINCT ?item) AS ?count)
           (GROUP_CONCAT(DISTINCT ?type; SEPARATOR="|") AS ?types)
           (GROUP_CONCAT(DISTINCT ?typeLabel; SEPARATOR="|") AS ?typeLabels)
    WHERE {
      ?item ?prop wd:${qid} .
      ?p wikibase:directClaim ?prop .
      MINUS { ?p wikibase:propertyType wikibase:ExternalId . }
      OPTIONAL {
        ?item wdt:P31 ?type .
        ?type rdfs:label ?typeLabel .
        FILTER(LANG(?typeLabel) IN ("fr", "en"))
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" . }
    }
    GROUP BY ?prop ?propLabel
    ORDER BY DESC(?count)
    LIMIT ${limit}
  `;

  const sparqlUrl = `${sparqlEndpoint}?query=${encodeURIComponent(sparql)}&format=json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  let bindings;
  try {
    const resp = await fetch(sparqlUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': userAgent,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get('Retry-After') || '5', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      const resp2 = await fetch(sparqlUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': userAgent,
        },
      });
      if (!resp2.ok) throw new Error(`SPARQL failed: ${resp2.status}`);
      const data2 = await resp2.json();
      bindings = data2?.results?.bindings || [];
    } else if (!resp.ok) {
      throw new Error(`SPARQL failed: ${resp.status}`);
    } else {
      const data = await resp.json();
      bindings = data?.results?.bindings || [];
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn(`[wikidataClient] SPARQL timeout for incoming aggregates of ${qid}`);
      return { aggregates: [] };
    }
    throw err;
  }

  if (!bindings || bindings.length === 0) return { aggregates: [] };

  // Filter out Wikimedia noise types
  const aggregates = [];
  const pidSet = new Set();

  for (const b of bindings) {
    const propUri = b.prop?.value;
    const count = parseInt(b.count?.value || '0', 10);
    if (!propUri || count === 0) continue;

    const pid = propUri.replace(WDT, '');
    const predLabel = b.propLabel?.value || pid;

    const typeUris = b.types?.value ? b.types.value.split('|').filter(Boolean) : [];
    const typeLabelStrs = b.typeLabels?.value ? b.typeLabels.value.split('|').filter(Boolean) : [];

    const targetClasses = [];
    const targetClassLabels = [];
    let hasNoise = false;

    // Process all types
    if (typeUris.length > 0) {
      typeUris.forEach((uri, idx) => {
        const qid = uri.replace(WD, '');
        if (WIKIMEDIA_NOISE_TYPES.has(qid)) {
          hasNoise = true;
          return;
        }
        targetClasses.push(qid);
        // Type labels might not match exactly 1:1 if languages differ, but we do our best
        // Actually, GROUP_CONCAT distinct can scramble the order! But for metadata it's fine.
        targetClassLabels.push(typeLabelStrs[idx] || qid);
      });
      
      // If it only had types and ALL of them were noise types, skip this aggregate
      if (hasNoise && targetClasses.length === 0) continue;
    } else {
      targetClasses.push('unknown');
      targetClassLabels.push('unknown');
    }

    pidSet.add(pid);

    aggregates.push({
      predicate: pid,
      predicateLabel: predLabel,
      targetClasses: targetClasses,
      targetClassLabels: targetClassLabels,
      count,
    });
  }

  // Resolve PID labels for better display
  if (pidSet.size > 0) {
    const pidLabels = await resolvePidLabels(Array.from(pidSet));
    for (const agg of aggregates) {
      const cachedLabel = pidLabels[agg.predicate];
      if (cachedLabel && cachedLabel !== agg.predicate) {
        agg.predicateLabel = cachedLabel;
      }
    }
  }

  return { aggregates };
};

/**
 * Fetch individual children of an aggregate (expand on demand).
 *
 * @param {string} qid — The target entity QID (the one being pointed at)
 * @param {string|string[]} pid — The predicate PID(s)
 * @param {number} limit
 * @returns {Promise<{nodes: LodNode[], edges: LodEdge[]}>}
 */
export const fetchAggregateChildren = async (qid, pid, limit = 50) => {
  const uri = `${WD}${qid}`;
  
  const sparql = `
    SELECT ?item ?itemLabel ?itemDescription
           (GROUP_CONCAT(DISTINCT ?typeId; SEPARATOR="|") AS ?types)
           (GROUP_CONCAT(DISTINCT ?typeLabel; SEPARATOR="|") AS ?typeLabels)
    WHERE {
      ?item wdt:${pid} wd:${qid} .
      OPTIONAL {
        ?item wdt:P31 ?typeId .
        ?typeId rdfs:label ?typeLabel . FILTER(LANG(?typeLabel) IN ("fr", "en"))
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" . }
    }
    GROUP BY ?item ?itemLabel ?itemDescription
    LIMIT ${limit}
  `;

  const sparqlUrl = `${sparqlEndpoint}?query=${encodeURIComponent(sparql)}&format=json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let bindings;
  try {
    const resp = await fetch(sparqlUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': userAgent,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get('Retry-After') || '5', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      const resp2 = await fetch(sparqlUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': userAgent,
        },
      });
      if (!resp2.ok) throw new Error(`SPARQL failed: ${resp2.status}`);
      const data2 = await resp2.json();
      bindings = data2?.results?.bindings || [];
    } else if (!resp.ok) {
      throw new Error(`SPARQL failed: ${resp.status}`);
    } else {
      const data = await resp.json();
      bindings = data?.results?.bindings || [];
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn(`[wikidataClient] SPARQL timeout for aggregate children of ${qid}:${pid}:${targetTypeQid}`);
      return { nodes: [], edges: [] };
    }
    throw err;
  }

  if (!bindings || bindings.length === 0) return { nodes: [], edges: [] };

  const source = {
    endpoint: 'wikidata',
    resourceUrl: uri,
    license: 'CC0',
    fetchedAt: new Date().toISOString(),
  };

  const nodes = [];
  const edges = [];
  const pidLabel = await resolvePidLabels([pid]).then(m => m[pid] || pid);

  for (const b of bindings) {
    const itemUri = b.item?.value;
    if (!itemUri) continue;

    const itemLabel = b.itemLabel?.value || itemUri.replace(WD, '');
    const itemDesc = b.itemDescription?.value || '';
    const typeIds = b.types?.value ? b.types.value.split('|').map(t => t.replace(WD, '')) : [];
    const typeLabelsList = b.typeLabels?.value ? b.typeLabels.value.split('|') : [];

    // Filter out items that are almost purely Wikimedia noise
    if (typeIds.length > 0 && typeIds.some(t => WIKIMEDIA_NOISE_TYPES.has(t))) {
      continue;
    }

    nodes.push({
      uri: itemUri,
      label: itemLabel,
      description: itemDesc,
      types: typeIds,
      typeLabels: typeLabelsList.length > 0 ? typeLabelsList : typeIds,
      properties: {},
      temporal: { start: null, end: null, precision: null },
      geo: { lat: null, lon: null },
      sources: [source],
      thumbnailUrl: null,
      externalIds: {},
      aliases: [],
    });

    edges.push({
      id: `${itemUri}-${pid}-${uri}`,
      source: itemUri,
      target: uri,
      predicate: pid,
      label: pidLabel,
      sources: [source],
      rank: 'normal',
      referenceCount: 0,
      classification: classifyPid(pid),
      redundancyGroup: getSecondaryGroupForPid(pid),
      tier: 'primary',
      direction: 'incoming',
      contextPromoted: false,
      weight: 70,
    });
  }

  return { nodes, edges };
};

/**
 * Execute a raw SPARQL query (proxy mode).
 *
 * @param {string} sparql
 * @param {number} [timeout=10000]
 * @returns {Promise<object>}
 */
export const executeSparql = async (sparql, timeout = 10000) => {
  const sparqlUrl = `${sparqlEndpoint}?query=${encodeURIComponent(sparql)}&format=json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(sparqlUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': userAgent,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get('Retry-After') || '5', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      const resp2 = await fetch(sparqlUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': userAgent,
        },
      });
      if (!resp2.ok) throw new Error(`SPARQL failed: ${resp2.status}`);
      return await resp2.json();
    }

    if (!resp.ok) throw new Error(`SPARQL failed: ${resp.status}`);
    return await resp.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};
