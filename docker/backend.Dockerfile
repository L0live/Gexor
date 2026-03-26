# ============================================================================
# Gexor Backend — Fastify + Node.js
# ============================================================================
FROM node:22-alpine

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy backend code + shared assets
COPY server/ ./server/
COPY data/*.json ./data/

# Non-root user
RUN addgroup -S gexor && adduser -S gexor -G gexor
USER gexor

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "server/index.js"]
