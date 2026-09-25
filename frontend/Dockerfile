FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY workspace/package.json workspace/package.json
RUN npm ci
COPY workspace ./workspace
RUN npm run build --workspace=@firmspace/workspace

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/public/ /usr/share/nginx/html/
COPY --from=build /app/workspace/dist/ /usr/share/nginx/html/app/
EXPOSE 80
