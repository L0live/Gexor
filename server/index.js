// ============================================================================
// Gexor Backend — Fastify Server Entry Point
// ============================================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import config from './config.js';
import { initSchema, cleanExpired, close as closeDb } from './db/pool.js';

// Routes
import searchRoutes from './routes/search.js';
import entityRoutes from './routes/entity.js';
import imageRoutes from './routes/image.js';
import sparqlRoutes from './routes/sparql.js';
import propertiesRoutes from './routes/properties.js';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    } : undefined,
  },
});

// ── Plugins ────────────────────────────────────────────────────────────────

await fastify.register(cors, {
  origin: config.cors.origin,
  methods: ['GET', 'POST'],
});

await fastify.register(rateLimit, {
  max: 600,             // 10 req/sec sustained — single-user local app
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip,
});

// ── Routes ─────────────────────────────────────────────────────────────────

await fastify.register(searchRoutes);
await fastify.register(entityRoutes);
await fastify.register(imageRoutes);
await fastify.register(sparqlRoutes);
await fastify.register(propertiesRoutes);

// ── Health check ───────────────────────────────────────────────────────────

fastify.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Cache cleanup (every 6 hours) ─────────────────────────────────────────

let cleanupInterval;

// ── Start ──────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    // Initialize DB schema
    await initSchema();

    // Start server
    await fastify.listen({ port: config.port, host: config.host });

    // Schedule periodic cache cleanup
    cleanupInterval = setInterval(cleanExpired, 6 * 60 * 60 * 1000);
    // Initial cleanup
    cleanExpired();

    console.log(`
╔══════════════════════════════════════════════════╗
║  Gexor Backend — running on port ${config.port}            ║
║  Endpoints:                                      ║
║    GET  /api/search?q=...                        ║
║    GET  /api/entity/:qid                         ║
║    GET  /api/entity/:qid/neighbors               ║
║    GET  /api/entity/:qid/expand                  ║
║    GET  /api/image?url=...                        ║
║    POST /api/sparql                              ║
║    GET  /api/health                              ║
╚══════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// ── Graceful shutdown ──────────────────────────────────────────────────────

const shutdown = async (signal) => {
  console.log(`\n[server] ${signal} received, shutting down...`);
  if (cleanupInterval) clearInterval(cleanupInterval);
  await fastify.close();
  await closeDb();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
