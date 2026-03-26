// ============================================================================
// Gexor Backend — Properties Classification Route
//
// GET /api/properties/classification
//   Serves wikidata_properties.json so that the frontend can fetch it at
//   runtime instead of bundling it statically (removes ~100KB from JS bundle).
// ============================================================================

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load once at module init — file only changes between deployments
let _classificationJson = null;

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function propertiesRoutes(fastify) {
  fastify.get('/api/properties/classification', {
    config: { rateLimit: false },
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    if (!_classificationJson) {
      try {
        const raw = readFileSync(
          join(__dirname, '../../data/wikidata_properties.json'),
          'utf-8'
        );
        _classificationJson = JSON.parse(raw);
      } catch (err) {
        request.log.error(err, 'Failed to load wikidata_properties.json');
        return reply.status(500).send({
          error: 'Classification data unavailable',
          code: 'file_error',
          details: err.message,
        });
      }
    }

    // Long-lived cache: file only changes on redeploy
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(_classificationJson);
  });
}
