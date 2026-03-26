// ============================================================================
// Gexor Backend — Search Route
// GET /api/search?q=text&lang=fr&limit=15
// ============================================================================

import { searchEntities, executeSparql } from '../services/wikidataClient.js';
import * as cache from '../services/cacheService.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lazy-load taxonomy data
let taxonomyData = null;
let propertyMatrixData = null;

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function searchRoutes(fastify) {
  fastify.get('/api/search', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 2 },
          lang: { type: 'string', default: 'fr' },
          limit: { type: 'integer', default: 15, minimum: 1, maximum: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const { q, lang, limit } = request.query;

    // Check cache (short TTL for search)
    const key = cache.cacheKey('search', `${lang}:${q}:${limit}`);
    const cached = await cache.get(key);
    if (cached) {
      return reply.send(cached);
    }

    try {
      const results = await searchEntities(q, lang, limit);
      await cache.set(key, results, 'search');
      return reply.send(results);
    } catch (err) {
      request.log.error(err, 'Search failed');
      return reply.status(502).send({ error: 'Wikidata search failed', code: 'upstream_error', details: err.message });
    }
  });

  // ── Serve taxonomy_light.json ──────────────────────────────────────────
  fastify.get('/api/taxonomy/light', {
    config: { rateLimit: false },
  }, async (request, reply) => {
    if (!taxonomyData) {
      try {
        const raw = readFileSync(join(__dirname, '../../data/taxonomy_light.json'), 'utf-8');
        taxonomyData = JSON.parse(raw);
      } catch (err) {
        request.log.error(err, 'Failed to load taxonomy');
        return reply.status(500).send({ error: 'Taxonomy data unavailable' });
      }
    }
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(taxonomyData);
  });

  // ── Serve property_type_matrix.json ────────────────────────────────────
  fastify.get('/api/taxonomy/property-matrix', {
    config: { rateLimit: false },
  }, async (request, reply) => {
    if (!propertyMatrixData) {
      try {
        const raw = readFileSync(join(__dirname, '../../data/property_type_matrix.json'), 'utf-8');
        propertyMatrixData = JSON.parse(raw);
      } catch (err) {
        request.log.error(err, 'Failed to load property matrix');
        return reply.status(500).send({ error: 'Property matrix data unavailable' });
      }
    }
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(propertyMatrixData);
  });

  // ── Filtered search via SPARQL ─────────────────────────────────────────
  fastify.post('/api/search/filtered', {
    schema: {
      body: {
        type: 'object',
        required: ['filters'],
        properties: {
          filters: { type: 'array' },
          text: { type: 'string' },
          limit: { type: 'integer', default: 50, maximum: 100 },
          offset: { type: 'integer', default: 0 },
          lang: { type: 'string', default: 'fr' },
        },
      },
    },
  }, async (request, reply) => {
    const { filters, text, limit, offset, lang } = request.body;

    try {
      const sparql = buildSparqlFromFilters(filters, text, limit, offset, lang);
      const raw = await executeSparql(sparql, 30000);
      const results = formatSparqlResults(raw, lang);
      return reply.send({ results, sparql });
    } catch (err) {
      request.log.error(err, 'Filtered search failed');
      return reply.status(502).send({ error: 'Filtered search failed', code: 'upstream_error', details: err.message });
    }
  });
}

// ── SPARQL builder from filters ──────────────────────────────────────────

// Validate QID/PID format to prevent SPARQL injection
const QID_RE = /^Q\d+$/;
const PID_RE = /^P\d+$/;

function buildSparqlFromFilters(filters, text, limit, offset, lang) {
  const parts = [];
  let varCounter = 0;

  // Type filters → P31/P279*
  const typeFilters = filters.filter(f => f.type === 'type' && f.operator !== 'not');
  for (const tf of typeFilters) {
    if (!QID_RE.test(tf.value)) continue;
    parts.push(`?item wdt:P31/wdt:P279* wd:${tf.value}.`);
  }

  // NOT type
  const notTypes = filters.filter(f => f.type === 'type' && f.operator === 'not');
  for (const ntf of notTypes) {
    if (!QID_RE.test(ntf.value)) continue;
    parts.push(`FILTER NOT EXISTS { ?item wdt:P31 wd:${ntf.value}. }`);
  }

  // Property filters → existence check
  const propFilters = filters.filter(f => f.type === 'property');
  for (const pf of propFilters) {
    if (!PID_RE.test(pf.value)) continue;
    if (pf.operator === 'not') {
      parts.push(`FILTER NOT EXISTS { ?item wdt:${pf.value} ?_any. }`);
    } else {
      varCounter++;
      parts.push(`?item wdt:${pf.value} ?_val${varCounter}.`);
    }
  }

  // HAS_VALUE → P = Q
  const hvFilters = filters.filter(f => f.type === 'has_value');
  for (const hv of hvFilters) {
    const pid = hv.meta?.pid;
    const qid = hv.meta?.qid;
    if (!pid || !qid || !PID_RE.test(pid) || !QID_RE.test(qid)) continue;
    parts.push(`?item wdt:${pid} wd:${qid}.`);
  }

  // Text → label filter
  let textClause = '';
  if (text && text.trim()) {
    const sanitized = text.trim().replace(/["\\\n\r]/g, '');
    textClause = `?item rdfs:label ?lbl. FILTER(LANG(?lbl) = "${lang}"). FILTER(CONTAINS(LCASE(?lbl), "${sanitized.toLowerCase()}"))`;
  }

  const safeLang = lang.replace(/[^a-z-]/gi, '');
  const safeLimit = Math.min(Math.max(1, limit || 50), 100);
  const safeOffset = Math.max(0, offset || 0);

  return `SELECT ?item ?itemLabel ?itemDescription WHERE {
  ${parts.join('\n  ')}
  ${textClause}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${safeLang},en". }
} LIMIT ${safeLimit} OFFSET ${safeOffset}`;
}

function formatSparqlResults(raw, lang) {
  if (!raw?.results?.bindings) return [];
  const WD = 'http://www.wikidata.org/entity/';

  return raw.results.bindings.map(b => ({
    uri: b.item?.value || '',
    label: b.itemLabel?.value || b.item?.value?.replace(WD, '') || '',
    description: b.itemDescription?.value || '',
    types: [],
    typeLabels: [],
  })).filter(r => r.uri.startsWith(WD));
}
