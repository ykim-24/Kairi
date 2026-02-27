FROM node:22-slim AS frontend-builder
WORKDIR /app/dashboard-ui
COPY dashboard-ui/package.json dashboard-ui/package-lock.json* ./
RUN npm ci
COPY dashboard-ui/ ./
RUN npm run build

FROM node:22-slim AS backend-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /app/dashboard-ui/dist ./dashboard-ui/dist

EXPOSE 5100
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:5100/health || exit 1
CMD ["node", "dist/index.js"]
