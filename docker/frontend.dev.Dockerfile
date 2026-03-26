# ============================================================================
# Gexor Frontend — Dev (Vite HMR)
# ============================================================================
FROM node:22-alpine

WORKDIR /app

# Copy manifests only — the actual install runs at container startup so the
# build step never needs outbound internet access.
COPY package.json package-lock.json* ./

# Copy static config files. Source code (src/, index.html, etc.) is mounted
# as a volume at runtime so every save triggers Vite HMR immediately.
COPY vite.config.js postcss.config.js tailwind.config.js ./
COPY data/wikidata_properties.json ./data/wikidata_properties.json

# Activate polling watch (required on Docker Desktop / WSL2)
ENV DOCKER_DEV=1
ENV NODE_ENV=development

EXPOSE 3000

# node_modules is a named volume (see docker-compose.dev.yml).
# On first start the volume is empty → npm install runs once.
# On subsequent starts the volume is already populated → skipped.
CMD ["sh", "-c", "if [ ! -d node_modules/.bin ]; then echo '[frontend] Installing packages...' && npm install; fi && exec npx vite --host"]
