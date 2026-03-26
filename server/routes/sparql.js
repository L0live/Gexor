// ============================================================================
// Gexor Backend — SPARQL Proxy Route
// POST /api/sparql  { query: "SELECT ..." }
//
// Transparent proxy for ad-hoc SPARQL queries. Handles rate-limiting,
// retry, and proper User-Agent identification.
// ============================================================================

import { executeSparql } from '../services/wikidataClient.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function sparqlRoutes(fastify) {
  fastify.post('/api/sparql', {
    schema: {
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 10 },
          timeout: { type: 'integer', default: 10000, minimum: 1000, maximum: 60000 },
        },
      },
    },
  }, async (request, reply) => {
    const { query, timeout } = request.body;

    try {
      const result = await executeSparql(query, timeout);
      return reply.send(result);
    } catch (err) {
      request.log.error(err, 'SPARQL proxy failed');
      if (err.message?.includes('timed out') || err.name === 'AbortError') {
        return reply.status(504).send({ error: 'SPARQL query timed out' });
      }
      return reply.status(502).send({ error: 'SPARQL query failed', code: 'upstream_error', details: err.message });
    }
  });
}
