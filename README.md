# Firmspace AI

German-language public website and multi-tenant AI-agent workspace. The repository contains the complete application source and a self-contained Docker Compose deployment that can be run on another VPS or Docker hosting provider without depending on the original Firmspace server.

The workspace includes accounts and organizations, an interactive agent catalog and workflow drafts, and a first text assistant that uses an OpenAI project key supplied by the organization owner. The provider key is encrypted before it is stored. Product areas that are not implemented are identified in the interface rather than filled with pretend data.

## Start the complete platform

Requirements: Docker Engine with the Compose plugin, and a hostname or `localhost` for browser access.

```sh
cp .env.example .env
```

Replace the sample values in `.env`. Generate random database and Redis passwords, plus the encryption key:

```sh
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
```

Use the first value for `POSTGRES_PASSWORD`, the second for `REDIS_PASSWORD`, and the third for `APP_ENCRYPTION_KEY`. Keep `.env` private and back up the encryption key separately; stored provider keys cannot be decrypted if that key is lost or changed.

Start the public site, workspace, API, PostgreSQL and Redis:

```sh
docker compose up --build -d
```

Open [http://localhost:8080](http://localhost:8080). The public landing page is `/`, and the signed-in workspace is `/app/`. PostgreSQL data persists in the `postgres_data` Docker volume. Stop the stack with `docker compose down`; this keeps its data. To delete the database and Redis data as well, run `docker compose down -v`.

## Host it on another domain

Point the domain's DNS to the new host. Put a TLS reverse proxy or managed HTTPS load balancer in front of the `web` service on port 80 (the included port mapping listens on `127.0.0.1:8080` by default). Set the following in `.env` for the new public address:

```dotenv
HTTP_BIND=127.0.0.1
HTTP_PORT=8080
APP_ORIGINS=https://your-domain.example
COOKIE_SECURE=true
```

If the reverse proxy runs in another machine or needs to connect over the host network, change `HTTP_BIND` to the appropriate reachable interface and restrict that port with the host firewall. Terminate HTTPS at the proxy, preserve the original `Host` header, and send `X-Forwarded-Proto: https`. Rebuild/recreate the services after changing settings:

```sh
docker compose up --build -d
```

Never commit `.env` or production secrets. Back up the database volume and `APP_ENCRYPTION_KEY` together. For a move to a new server, restore the database and keep the same encryption key to retain access to configured provider credentials.

## Repository layout

```text
frontend/public/       German public website
frontend/Dockerfile    Static site and workspace image build
frontend/nginx.conf    Website, workspace and API routing
workspace/             React workspace application
api/                   Fastify API and PostgreSQL migrations
compose.yaml           Portable full stack: web, API, PostgreSQL, Redis
compose.server.yaml    Existing Firmspace deployment using shared infrastructure
deploy/                Existing Caddy configuration for firmspace.eu
```

The default `compose.yaml` is standalone and has no dependency on `/opt/infrastructure`, shared databases, or the old server's filesystem paths. `compose.server.yaml` preserves the existing deployment shape for the current Firmspace server. The root `.gitignore` excludes local `.env` files, dependencies, and build output.

## Development

Requires Node.js 24+. Install packages with `npm ci`; build both app layers with `npm run build`. The frontend development server is in `workspace/`, and the API workspace is in `api/`. Runtime and API details are documented in `API.md`, `ARCHITECTURE.md`, `DATABASE.md`, `INTEGRATIONS.md`, `SECURITY.md`, and `OPERATIONS.md`.

The implementation roadmap is in `IMPLEMENTATION_PLAN.md`.
