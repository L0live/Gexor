// ============================================================================
// Gexor Backend — Configuration
// ============================================================================

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',

  // PostgreSQL
  database: {
    connectionString: process.env.DATABASE_URL || null,
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'gexor',
    user: process.env.PGUSER || process.env.USER || 'postgres',
    password: process.env.PGPASSWORD || 'gexor',
    max: 20,               // max pool size
    idleTimeoutMillis: 30000,
  },

  // Wikidata endpoints
  wikidata: {
    actionApi: 'https://www.wikidata.org/w/api.php',
    sparqlEndpoint: 'https://query.wikidata.org/sparql',
    userAgent: 'Gexor/2.0 (https://github.com/lolive/Gexor; LOD graph explorer)',
    maxConcurrent: 10,
    minIntervalMs: 50,      // ms between consecutive API calls
    batchSize: 50,           // max entities per wbgetentities call
    defaultTimeout: 15000,   // ms
  },

  // Cache TTLs (milliseconds) — matches frontend cacheService.js
  cacheTtl: {
    wikidata: 24 * 60 * 60 * 1000,        // 24 hours
    cultural: 7 * 24 * 60 * 60 * 1000,     // 7 days
    geographic: 30 * 24 * 60 * 60 * 1000,  // 30 days
    default: 24 * 60 * 60 * 1000,          // 24 hours
    labels: 30 * 24 * 60 * 60 * 1000,      // 30 days (PID/QID labels rarely change)
    search: 60 * 60 * 1000,                // 1 hour (search results are ephemeral)
  },

  // Image proxy
  allowedImageHosts: [
    'commons.wikimedia.org',
    'upload.wikimedia.org',
  ],

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
};

export default config;
