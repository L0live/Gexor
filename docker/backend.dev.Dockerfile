# ============================================================================
# Gexor Backend — Dev (nodemon hot-reload)
# ============================================================================
FROM node:22-alpine

WORKDIR /app

# Copy manifests only — the actual install runs at container startup so the
# build step never needs outbound internet access.
COPY package.json package-lock.json* ./

# --legacy-watch is required on Docker Desktop / WSL2 where inotify events
# do not cross the Linux/Windows boundary.
ENV NODE_ENV=development
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

# node_modules is a named volume (see docker-compose.dev.yml).
# On first start the volume is empty → npm install runs once.
# On subsequent starts the volume is already populated → skipped.
CMD ["sh", "-c", "if [ ! -d node_modules/.bin ]; then echo '[backend] Installing packages...' && npm install; fi && exec npx nodemon --legacy-watch server/index.js"]
