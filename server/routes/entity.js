// ============================================================================
// Gexor Backend — Entity Routes
//
// GET /api/entity/:qid            — Full entity properties (LodNode)
// GET /api/entity/:qid/neighbors  — Neighbors (outgoing/incoming/both)
// GET /api/entity/:qid/expand     — Combined: entity + neighbors in one call
// ============================================================================

import { fetchEntityProperties, fetchOutgoingNeighbors, fetchIncomingNeighbors, fetchIncomingAggregates, fetchAggregateChildren } from '../services/wikidataClient.js';
import * as cache from '../services/cacheService.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function entityRoutes(fastify) {

  // ── GET /api/entity/:qid ────────────────────────────────────────────────
  fastify.get('/api/entity/:qid', {
    schema: {
      params: {
        type: 'object',
        required: ['qid'],
        properties: {
          qid: { type: 'string', pattern: '^Q\\d+$' },
        },
      },
    },
  }, async (request, reply) => {
    const { qid } = request.params;
    const key = cache.cacheKey('entity', qid);

    // Check cache
    const cached = await cache.get(key);
    if (cached) return reply.send(cached);

    try {
      const node = await fetchEntityProperties(qid);
      await cache.set(key, node, 'wikidata');
      return reply.send(node);
    } catch (err) {
      request.log.error(err, `Failed to fetch entity ${qid}`);
      return reply.status(502).send({ error: 'Entity fetch failed', code: 'upstream_error', details: err.message });
    }
  });

  // ── GET /api/entity/:qid/neighbors ──────────────────────────────────────
  fastify.get('/api/entity/:qid/neighbors', {
    schema: {
      params: {
        type: 'object',
        required: ['qid'],
        properties: {
          qid: { type: 'string', pattern: '^Q\\d+$' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'], default: 'outgoing' },
          limit: { type: 'integer', default: 50, minimum: 1, maximum: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { qid } = request.params;
    const { direction, limit } = request.query;

    const key = cache.cacheKey('neighbors', `${qid}:${direction}:${limit}`);
    const cached = await cache.get(key);
    if (cached) return reply.send(cached);

    try {
      let result;

      if (direction === 'both') {
        // Fetch outgoing and incoming in parallel
        const [outgoing, incoming] = await Promise.allSettled([
          fetchOutgoingNeighbors(qid, limit),
          fetchIncomingNeighbors(qid, limit),
        ]);

        const outData = outgoing.status === 'fulfilled' ? outgoing.value : { nodes: [], edges: [] };
        const inData = incoming.status === 'fulfilled' ? incoming.value : { nodes: [], edges: [] };

        // Merge (deduplicate nodes by URI)
        const nodeMap = new Map();
        for (const n of [...outData.nodes, ...inData.nodes]) {
          if (!nodeMap.has(n.uri)) nodeMap.set(n.uri, n);
        }

        result = {
          nodes: Array.from(nodeMap.values()),
          edges: [...outData.edges, ...inData.edges],
          // Tag which edges are incoming so the frontend can track them
          incomingEdgeIds: inData.edges.map(e => e.id),
        };
      } else if (direction === 'incoming') {
        const data = await fetchIncomingNeighbors(qid, limit);
        result = {
          ...data,
          incomingEdgeIds: data.edges.map(e => e.id),
        };
      } else {
        result = await fetchOutgoingNeighbors(qid, limit);
        result.incomingEdgeIds = [];
      }

      await cache.set(key, result, 'wikidata');
      return reply.send(result);
    } catch (err) {
      request.log.error(err, `Failed to fetch neighbors for ${qid}`);
      return reply.status(502).send({ error: 'Neighbor fetch failed', code: 'upstream_error', details: err.message });
    }
  });

  // ── GET /api/entity/:qid/expand ─────────────────────────────────────────
  // Combined endpoint: entity properties + neighbors in one round-trip
  fastify.get('/api/entity/:qid/expand', {
    schema: {
      params: {
        type: 'object',
        required: ['qid'],
        properties: {
          qid: { type: 'string', pattern: '^Q\\d+$' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'], default: 'both' },
          limit: { type: 'integer', default: 50, minimum: 1, maximum: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { qid } = request.params;
    const { direction, limit } = request.query;

    const expandKey = cache.cacheKey('expand', `${qid}:${direction}:${limit}`);
    const cached = await cache.get(expandKey);
    if (cached) return reply.send(cached);

    try {
      // Check if entity is already cached separately
      const entityKey = cache.cacheKey('entity', qid);
      let node = await cache.get(entityKey);

      // Fetch entity and neighbors in parallel
      const tasks = [];

      if (!node) {
        tasks.push(fetchEntityProperties(qid).then(n => { node = n; }));
      }

      let neighborsResult = { nodes: [], edges: [], incomingEdgeIds: [] };

      if (direction === 'both') {
        tasks.push(
          Promise.allSettled([
            fetchOutgoingNeighbors(qid, limit),
            fetchIncomingNeighbors(qid, limit),
          ]).then(([outResult, inResult]) => {
            const outData = outResult.status === 'fulfilled' ? outResult.value : { nodes: [], edges: [] };
            const inData = inResult.status === 'fulfilled' ? inResult.value : { nodes: [], edges: [] };
            const nodeMap = new Map();
            for (const n of [...outData.nodes, ...inData.nodes]) {
              if (!nodeMap.has(n.uri)) nodeMap.set(n.uri, n);
            }
            neighborsResult = {
              nodes: Array.from(nodeMap.values()),
              edges: [...outData.edges, ...inData.edges],
              incomingEdgeIds: inData.edges.map(e => e.id),
            };
          })
        );
      } else if (direction === 'incoming') {
        tasks.push(
          fetchIncomingNeighbors(qid, limit).then(data => {
            neighborsResult = { ...data, incomingEdgeIds: data.edges.map(e => e.id) };
          })
        );
      } else {
        tasks.push(
          fetchOutgoingNeighbors(qid, limit).then(data => {
            neighborsResult = { ...data, incomingEdgeIds: [] };
          })
        );
      }

      await Promise.all(tasks);

      const result = {
        node,
        neighbors: neighborsResult,
      };

      // Cache the combined result and the entity separately
      await Promise.all([
        cache.set(expandKey, result, 'wikidata'),
        node ? cache.set(entityKey, node, 'wikidata') : Promise.resolve(),
      ]);

      return reply.send(result);
    } catch (err) {
      request.log.error(err, `Failed to expand entity ${qid}`);
      return reply.status(502).send({ error: 'Entity expansion failed', code: 'upstream_error', details: err.message });
    }
  });

  // ── GET /api/entity/:qid/incoming-aggregates ────────────────────────────
  // Grouped incoming references: (PID, P31 type, count)
  fastify.get('/api/entity/:qid/incoming-aggregates', {
    schema: {
      params: {
        type: 'object',
        required: ['qid'],
        properties: {
          qid: { type: 'string', pattern: '^Q\\d+$' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 100, minimum: 1, maximum: 500 },
        },
      },
    },
  }, async (request, reply) => {
    const { qid } = request.params;
    const { limit } = request.query;

    const key = cache.cacheKey('incoming-aggregates', `${qid}:${limit}`);
    const cached = await cache.get(key);
    if (cached) return reply.send(cached);

    try {
      const result = await fetchIncomingAggregates(qid, limit);
      await cache.set(key, result, 'wikidata');
      return reply.send(result);
    } catch (err) {
      request.log.error(err, `Failed to fetch incoming aggregates for ${qid}`);
      return reply.status(502).send({ error: 'Incoming aggregates failed', code: 'upstream_error', details: err.message });
    }
  });

  // ── GET /api/entity/:qid/aggregate-children ─────────────────────────────
  // Expand a specific aggregate: individual entities for a (PID, P31 type) pair
  fastify.get('/api/entity/:qid/aggregate-children', {
    schema: {
      params: {
        type: 'object',
        required: ['qid'],
        properties: {
          qid: { type: 'string', pattern: '^Q\\d+$' },
        },
      },
      querystring: {
        type: 'object',
        required: ['pids'],
        properties: {
          pids: { type: 'string' },
          type: { type: 'string', pattern: '^(Q\\d+|unknown)$', default: 'unknown' },
          limit: { type: 'integer', default: 50, minimum: 1, maximum: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { qid } = request.params;
    const { pids, type, limit } = request.query;

    const key = cache.cacheKey('aggregate-children', `${qid}:${pids}:${type}:${limit}`);
    const cached = await cache.get(key);
    if (cached) return reply.send(cached);

    try {
      // pids is comma-separated list of properties
      const pidList = pids.split(',').map(p => p.trim()).filter(Boolean);
      const result = await fetchAggregateChildren(qid, pidList, type, limit);
      await cache.set(key, result, 'wikidata');
      return reply.send(result);
    } catch (err) {
      request.log.error(err, `Failed to fetch aggregate children for ${qid}:${pids}:${type}`);
      return reply.status(502).send({ error: 'Aggregate children fetch failed', code: 'upstream_error', details: err.message });
    }
  });
}
