FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY workspace/package.json workspace/package.json
RUN npm ci
COPY api ./api
RUN npm run build --workspace=@firmspace/api

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY workspace/package.json workspace/package.json
RUN npm ci --omit=dev --workspace=@firmspace/api --include-workspace-root=false \
    && npm cache clean --force
COPY --from=build --chown=node:node /app/api/dist ./dist
COPY --from=build --chown=node:node /app/api/migrations ./migrations
USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/server.js"]
