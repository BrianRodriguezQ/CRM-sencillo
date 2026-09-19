# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend (with devDeps for tsc)
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

# Stage 3: Production runtime
FROM node:20-alpine
WORKDIR /app

# Use non-root user (node user is uid 1000 in node:alpine)
USER node

# Frontend dist → served by backend as ./public/
COPY --from=frontend-build --chown=node:node /app/frontend/dist /app/public

# Compiled backend
COPY --from=backend-build --chown=node:node /app/backend/dist /app/dist
COPY --from=backend-build --chown=node:node /app/backend/node_modules /app/node_modules
COPY --from=backend-build --chown=node:node /app/backend/package.json /app/

# Migrations aren't copied by tsc (.sql files)
COPY --from=backend-build --chown=node:node backend/src/db/migrations /app/dist/db/migrations

# Fonts aren't copied by tsc (.ttf files)
COPY --from=backend-build --chown=node:node backend/src/assets /app/dist/assets

# Entrypoint
COPY --from=backend-build --chown=node:node backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

RUN mkdir -p /app/uploads && chown node:node /app/uploads

EXPOSE 3001
ENV NODE_ENV=production

CMD ["/app/docker-entrypoint.sh"]
