// ============================================================================
// Gexor Backend — Image Proxy Route
// GET /api/image?url=<encoded_url>
//
// Proxies images from Wikimedia Commons to solve the COEP conflict:
// the frontend needs Cross-Origin-Embedder-Policy: require-corp for
// SharedArrayBuffer, but Wikimedia doesn't send CORP headers.
// Serving images through this proxy makes them same-origin.
// ============================================================================

import config from '../config.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function imageRoutes(fastify) {
  fastify.get('/api/image', {
    schema: {
      querystring: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri' },
        },
      },
    },
  }, async (request, reply) => {
    const { url } = request.query;

    // Security: only proxy images from allowed hosts
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reply.status(400).send({ error: 'Invalid URL' });
    }

    if (!config.allowedImageHosts.includes(parsedUrl.hostname)) {
      return reply.status(403).send({ error: 'Host not allowed' });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const resp = await fetch(url, {
        headers: {
          'User-Agent': config.wikidata.userAgent,
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        return reply.status(resp.status).send({ error: `Upstream returned ${resp.status}` });
      }

      // Forward content type and set caching headers
      const contentType = resp.headers.get('content-type') || 'application/octet-stream';
      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=86400'); // 24h browser cache
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');

      // Stream the image body
      const arrayBuffer = await resp.arrayBuffer();
      return reply.send(Buffer.from(arrayBuffer));
    } catch (err) {
      if (err.name === 'AbortError') {
        return reply.status(504).send({ error: 'Image proxy timeout' });
      }
      request.log.error(err, 'Image proxy failed');
      return reply.status(502).send({ error: 'Image proxy failed', code: 'upstream_error', details: err.message });
    }
  });
}
