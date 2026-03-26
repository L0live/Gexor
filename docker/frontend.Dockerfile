# ============================================================================
# Gexor Frontend — Vite build → nginx
# ============================================================================

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

# Copy frontend source + config
COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY src/ ./src/
COPY data/wikidata_properties.json ./data/wikidata_properties.json

# Build with the backend URL pointing to nginx's /api proxy
ENV VITE_API_BASE_URL=/api
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

COPY docker/nginx.conf /etc/nginx/conf.d/gexor.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
