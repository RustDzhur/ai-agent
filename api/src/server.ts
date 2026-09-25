import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { inTransaction, pool, setRequestContext, type DbClient } from './db/pool.js';
import {
  assistantRunSchema,
  createOrganizationSchema,
  loginSchema,
  openAiCredentialSchema,
  registerSchema,
  selectOrganizationSchema,
  tenantAgentStatusSchema,
  updateOrganizationSchema,
  workflowSchema,
  workflowStatusSchema,
} from './auth/schemas.js';
import { decryptSecret, encryptSecret, type EncryptedSecret } from './integrations/secret-box.js';

const SESSION_COOKIE = config.cookieSecure ? '__Host-fs_session' : 'fs_session';
const CSRF_COOKIE = config.cookieSecure ? '__Host-fs_csrf' : 'fs_csrf';
const sessionTtlSeconds = config.SESSION_TTL_HOURS * 60 * 60;
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const dummyPasswordHash = argon2.hash('fixed-non-user-account-dummy-password', {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
});

type Session = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  activeOrganizationId: string | null;
};

type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

class HttpError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string) {
    super(code);
  }
}

const redis = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  username: config.REDIS_USERNAME,
  password: config.REDIS_PASSWORD,
  lazyConnect: true,
  enableReadyCheck: false,
  connectTimeout: 2_000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.passwordHash',
        'req.body.apiKey',
        'res.headers.set-cookie',
      ],
      censor: '[REDACTED]',
    },
  },
  bodyLimit: 64 * 1024,
  trustProxy: true,
  genReqId(request) {
    const incoming = request.headers['x-request-id'];
    if (typeof incoming === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(incoming)) return incoming;
    return randomUUID();
  },
});

await app.register(cookie);
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, {
  global: false,
  max: 120,
  timeWindow: '1 minute',
  redis,
  nameSpace: 'firmspace:rate-limit:',
  skipOnError: false,
});

app.addHook('onRequest', async (request, reply) => {
  reply.header('X-Request-Id', request.id);
  reply.header('X-Trace-Id', request.id);
});

pool.on('error', (error: Error) => app.log.error({ err: error }, 'Idle PostgreSQL client error'));
redis.on('error', (error: Error) => app.log.error({ err: error }, 'Redis connection error'));

function safeTokenEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function setCsrfCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(CSRF_COOKIE, token, {
    path: '/',
    secure: config.cookieSecure,
    httpOnly: false,
    sameSite: 'strict',
    maxAge: sessionTtlSeconds,
  });
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    secure: config.cookieSecure,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: sessionTtlSeconds,
  });
}

function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', secure: config.cookieSecure, httpOnly: true, sameSite: 'lax' });
  reply.clearCookie(CSRF_COOKIE, { path: '/', secure: config.cookieSecure, sameSite: 'strict' });
}

function issueCsrf(reply: FastifyReply): string {
  const token = randomBytes(32).toString('hex');
  setCsrfCookie(reply, token);
  return token;
}

async function findSession(request: FastifyRequest): Promise<Session | null> {
  const rawToken = request.cookies[SESSION_COOKIE];
  if (!rawToken || rawToken.length > 128) return null;
  const tokenHash = createHash('sha256').update(rawToken).digest();
  const result = await pool.query<{
    id: string;
    user_id: string;
    full_name: string;
    email: string;
    active_organization_id: string | null;
  }>(
    `SELECT sessions.id, sessions.user_id, users.full_name, users.email, sessions.active_organization_id
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    activeOrganizationId: row.active_organization_id,
  };
}

async function createSession(client: DbClient, userId: string, activeOrganizationId: string | null): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest();
  await client.query(
    `INSERT INTO sessions (id, user_id, token_hash, active_organization_id, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 * interval '1 second'))`,
    [randomUUID(), userId, tokenHash, activeOrganizationId, sessionTtlSeconds],
  );
  return rawToken;
}

async function listOrganizations(client: DbClient, userId: string) {
  await setRequestContext(client, userId);
  const result = await client.query<{
    organization_id: string;
    organization_name: string;
    role: MemberRole;
    created_at: Date;
  }>(
    `SELECT organizations.id AS organization_id, organizations.name AS organization_name,
            memberships.role, organizations.created_at
     FROM organization_memberships memberships
     JOIN organizations ON organizations.id = memberships.organization_id
     WHERE memberships.user_id = $1 AND memberships.status = 'active'
     ORDER BY organizations.name`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.organization_id,
    name: row.organization_name,
    role: row.role,
    createdAt: row.created_at,
  }));
}

async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<Session | null> {
  const session = await findSession(request);
  if (!session) {
    reply.code(401).send({ error: 'authentication_required' });
    return null;
  }
  request.log.info({ user_id: session.userId, tenant_id: session.activeOrganizationId, trace_id: request.id }, 'Authenticated API request');
  return session;
}

async function withTenant<T>(
  session: Session,
  operation: (client: DbClient, role: MemberRole) => Promise<T>,
): Promise<T> {
  if (!session.activeOrganizationId) throw new HttpError(403, 'organization_access_required');
  return inTransaction(async (client) => {
    await setRequestContext(client, session.userId, session.activeOrganizationId);
    const membership = await client.query<{ role: MemberRole }>(
      `SELECT role FROM organization_memberships
       WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
      [session.activeOrganizationId, session.userId],
    );
    const role = membership.rows[0]?.role;
    if (!role) throw new HttpError(403, 'organization_access_required');
    return operation(client, role);
  });
}

async function writeAudit(
  client: DbClient,
  request: FastifyRequest,
  session: Session,
  action: string,
  metadata: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  if (!session.activeOrganizationId) return;
  await client.query(
    `INSERT INTO audit_logs (id, organization_id, user_id, request_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [randomUUID(), session.activeOrganizationId, session.userId, request.id, action, JSON.stringify(metadata)],
  );
}

app.addHook('preHandler', async (request, reply) => {
  if (!request.url.startsWith('/api/v1/') || !unsafeMethods.has(request.method)) return;
  const origin = request.headers.origin;
  if (!origin || !config.origins.has(origin)) {
    reply.code(403).send({ error: 'origin_not_allowed' });
    return;
  }
  const csrfCookie = request.cookies[CSRF_COOKIE];
  const csrfHeader = request.headers['x-csrf-token'];
  if (typeof csrfHeader !== 'string' || typeof csrfCookie !== 'string' || !safeTokenEqual(csrfCookie, csrfHeader)) {
    reply.code(403).send({ error: 'csrf_validation_failed' });
  }
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof HttpError) {
    reply.code(error.statusCode).send({ error: error.code, requestId: request.id });
    return;
  }
  if (error instanceof Error && 'validation' in error && error.validation) {
    reply.code(400).send({ error: 'invalid_request', requestId: request.id });
    return;
  }
  request.log.error({ err: error }, 'Unhandled request error');
  reply.code(500).send({ error: 'internal_error', requestId: request.id });
});

app.get('/health/live', async () => ({ status: 'ok' }));
app.get('/health/ready', async (_request, reply) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    return { status: 'ready' };
  } catch {
    return reply.code(503).send({ status: 'not_ready' });
  }
});

app.get('/api/v1/auth/session', async (request, reply) => {
  let csrfToken = request.cookies[CSRF_COOKIE];
  if (!csrfToken || !/^[a-f0-9]{64}$/.test(csrfToken)) csrfToken = issueCsrf(reply);
  const session = await findSession(request);
  if (!session) return { authenticated: false, csrfToken };

  const organizations = await inTransaction((client) => listOrganizations(client, session.userId));
  let activeOrganizationId = session.activeOrganizationId;
  if (!organizations.some((organization) => organization.id === activeOrganizationId)) {
    activeOrganizationId = organizations[0]?.id ?? null;
    await pool.query('UPDATE sessions SET active_organization_id = $1 WHERE id = $2', [activeOrganizationId, session.id]);
  }
  const activeOrganization = organizations.find((organization) => organization.id === activeOrganizationId) ?? null;

  return {
    authenticated: true,
    csrfToken,
    user: { id: session.userId, fullName: session.fullName, email: session.email },
    organizations,
    activeOrganization,
  };
});

app.post('/api/v1/auth/register', {
  config: { rateLimit: { max: 4, timeWindow: '1 hour' } },
}, async (request, reply) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
  const input = parsed.data;
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
  const userId = randomUUID();
  const organizationId = randomUUID();
  let rawSession: string;
  try {
    rawSession = await inTransaction(async (client) => {
      await client.query(
        'INSERT INTO users (id, full_name, email, password_hash) VALUES ($1, $2, $3, $4)',
        [userId, input.fullName, input.email, passwordHash],
      );
      await setRequestContext(client, userId, organizationId);
      await client.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [organizationId, input.organizationName]);
      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [organizationId, userId],
      );
      await client.query(
        `INSERT INTO tenant_agents (id, organization_id, template_slug, installed_by)
         VALUES ($1, $2, 'workspace-assistant', $3)`,
        [randomUUID(), organizationId, userId],
      );
      const sessionToken = await createSession(client, userId, organizationId);
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, request_id, action, metadata)
         VALUES ($1, $2, $3, $4, 'account.registered', '{}'::jsonb)`,
        [randomUUID(), organizationId, userId, request.id],
      );
      return sessionToken;
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return reply.code(409).send({ error: 'email_already_registered' });
    }
    throw error;
  }

  setSessionCookie(reply, rawSession);
  const csrfToken = issueCsrf(reply);
  reply.code(201);
  return { authenticated: true, csrfToken };
});

app.post('/api/v1/auth/login', {
  config: { rateLimit: { max: 8, timeWindow: '15 minutes' } },
}, async (request, reply) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
  const result = await pool.query<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE lower(email) = $1',
    [parsed.data.email],
  );
  const account = result.rows[0];
  const passwordValid = await argon2.verify(account?.password_hash ?? await dummyPasswordHash, parsed.data.password).catch(() => false);
  if (!account || !passwordValid) return reply.code(401).send({ error: 'invalid_credentials' });

  const created = await inTransaction(async (client) => {
    const organizations = await listOrganizations(client, account.id);
    const activeOrganizationId = organizations[0]?.id ?? null;
    const sessionToken = await createSession(client, account.id, activeOrganizationId);
    if (activeOrganizationId) {
      await setRequestContext(client, account.id, activeOrganizationId);
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, request_id, action, metadata)
         VALUES ($1, $2, $3, $4, 'account.login', '{}'::jsonb)`,
        [randomUUID(), activeOrganizationId, account.id, request.id],
      );
    }
    return { sessionToken, activeOrganizationId };
  });

  setSessionCookie(reply, created.sessionToken);
  const csrfToken = issueCsrf(reply);
  return { authenticated: true, csrfToken, activeOrganizationId: created.activeOrganizationId };
});

app.post('/api/v1/auth/logout', async (request, reply) => {
  const session = await findSession(request);
  if (session) {
    await inTransaction(async (client) => {
      if (session.activeOrganizationId) {
        await setRequestContext(client, session.userId, session.activeOrganizationId);
        await writeAudit(client, request, session, 'account.logout');
      }
      await client.query('DELETE FROM sessions WHERE id = $1', [session.id]);
    });
  }
  clearAuthCookies(reply);
  return { authenticated: false };
});

app.post('/api/v1/organizations', {
  config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
}, async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const parsed = createOrganizationSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
  const organizationId = randomUUID();

  await inTransaction(async (client) => {
    await setRequestContext(client, session.userId, organizationId);
    await client.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [organizationId, parsed.data.name]);
    await client.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [organizationId, session.userId],
    );
    await client.query(
      `INSERT INTO tenant_agents (id, organization_id, template_slug, installed_by)
       VALUES ($1, $2, 'workspace-assistant', $3)`,
      [randomUUID(), organizationId, session.userId],
    );
    await client.query('UPDATE sessions SET active_organization_id = $1 WHERE id = $2', [organizationId, session.id]);
    await writeAudit(client, request, { ...session, activeOrganizationId: organizationId }, 'organization.created');
  });
  return reply.code(201).send({ id: organizationId, name: parsed.data.name, role: 'owner' });
});

app.post('/api/v1/organizations/select', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const parsed = selectOrganizationSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
  const selected = await inTransaction(async (client) => {
    await setRequestContext(client, session.userId);
    const membership = await client.query<{ role: MemberRole; name: string }>(
      `SELECT memberships.role, organizations.name
       FROM organization_memberships memberships
       JOIN organizations ON organizations.id = memberships.organization_id
       WHERE memberships.organization_id = $1 AND memberships.user_id = $2 AND memberships.status = 'active'`,
      [parsed.data.organizationId, session.userId],
    );
    const row = membership.rows[0];
    if (!row) throw new HttpError(403, 'organization_access_required');
    await client.query('UPDATE sessions SET active_organization_id = $1 WHERE id = $2', [parsed.data.organizationId, session.id]);
    await setRequestContext(client, session.userId, parsed.data.organizationId);
    await writeAudit(client, request, { ...session, activeOrganizationId: parsed.data.organizationId }, 'organization.switched');
    return { id: parsed.data.organizationId, name: row.name, role: row.role };
  });
  return { activeOrganization: selected };
});

app.get('/api/v1/organizations/current', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return withTenant(session, async (client, role) => {
    const result = await client.query<{ id: string; name: string; created_at: Date }>(
      'SELECT id, name, created_at FROM organizations WHERE id = $1',
      [session.activeOrganizationId],
    );
    const organization = result.rows[0];
    if (!organization) throw new HttpError(403, 'organization_access_required');
    return { ...organization, role };
  });
});

app.get('/api/v1/organizations/current/members', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return withTenant(session, async (client) => {
    const result = await client.query<{
      user_id: string;
      full_name: string;
      email: string;
      role: MemberRole;
      created_at: Date;
    }>(
      `SELECT users.id AS user_id, users.full_name, users.email, memberships.role, memberships.created_at
       FROM organization_memberships memberships
       JOIN users ON users.id = memberships.user_id
       WHERE memberships.organization_id = $1 AND memberships.status = 'active'
       ORDER BY memberships.created_at, users.full_name`,
      [session.activeOrganizationId],
    );
    return { members: result.rows };
  });
});

app.patch('/api/v1/organizations/current', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const parsed = updateOrganizationSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
  return withTenant(session, async (client, role) => {
    if (role !== 'owner' && role !== 'admin') throw new HttpError(403, 'permission_denied');
    const result = await client.query<{ id: string; name: string; updated_at: Date }>(
      `UPDATE organizations SET name = $1, updated_at = now() WHERE id = $2 RETURNING id, name, updated_at`,
      [parsed.data.name, session.activeOrganizationId],
    );
    await writeAudit(client, request, session, 'organization.updated', { name: parsed.data.name });
    return result.rows[0];
  });
});

app.get('/api/v1/organizations/current/audit', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return withTenant(session, async (client) => {
    const result = await client.query<{
      id: string;
      user_id: string | null;
      full_name: string | null;
      action: string;
      metadata: Record<string, unknown>;
      request_id: string;
      created_at: Date;
    }>(
      `SELECT audit_logs.id, audit_logs.user_id, users.full_name, audit_logs.action,
              audit_logs.metadata, audit_logs.request_id, audit_logs.created_at
       FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
       WHERE audit_logs.organization_id = $1
       ORDER BY audit_logs.created_at DESC LIMIT 50`,
      [session.activeOrganizationId],
    );
    return { events: result.rows };
  });
});

app.get('/api/v1/integrations/openai', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return withTenant(session, async (client) => {
    const result = await client.query<{ secret_hint: string; updated_at: Date }>(
      `SELECT secret_hint, updated_at FROM provider_connections
       WHERE organization_id = $1 AND provider = 'openai'`,
      [session.activeOrganizationId],
    );
    const connection = result.rows[0];
    return { configured: Boolean(connection), keyHint: connection ? `•••• ${connection.secret_hint}` : null, updatedAt: connection?.updated_at ?? null };
  });
});

app.put('/api/v1/integrations/openai', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const parsed = openAiCredentialSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
  const permitted = await withTenant(session, async (_client, role) => {
    if (role !== 'owner' && role !== 'admin') throw new HttpError(403, 'permission_denied');
    return true;
  });
  if (!permitted) throw new HttpError(403, 'permission_denied');

  let validation: Response;
  try {
    validation = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${parsed.data.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, 'provider_unreachable');
  }
  if (validation.status === 401) throw new HttpError(400, 'openai_key_invalid');
  if (validation.status === 403) throw new HttpError(400, 'openai_key_insufficient_permissions');
  if (!validation.ok) throw new HttpError(502, 'provider_unavailable');
  const modelCatalog = await validation.json() as { data?: { id?: string }[] };
  if (!modelCatalog.data?.some((model) => model.id === 'gpt-6-luna')) throw new HttpError(400, 'openai_model_unavailable');

  return withTenant(session, async (client) => {
    const encrypted = encryptSecret(parsed.data.apiKey);
    await client.query(
      `INSERT INTO provider_connections
       (organization_id, provider, secret_ciphertext, secret_iv, secret_tag, secret_hint, created_by)
       VALUES ($1, 'openai', $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id, provider) DO UPDATE SET
         secret_ciphertext = EXCLUDED.secret_ciphertext,
         secret_iv = EXCLUDED.secret_iv,
         secret_tag = EXCLUDED.secret_tag,
         secret_hint = EXCLUDED.secret_hint,
         created_by = EXCLUDED.created_by,
         updated_at = now()`,
      [session.activeOrganizationId, encrypted.ciphertext, encrypted.iv, encrypted.tag, parsed.data.apiKey.slice(-4), session.userId],
    );
    await writeAudit(client, request, session, 'integration.openai.connected');
    return { configured: true, keyHint: `•••• ${parsed.data.apiKey.slice(-4)}` };
  });
});

app.delete('/api/v1/integrations/openai', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return withTenant(session, async (client, role) => {
    if (role !== 'owner' && role !== 'admin') throw new HttpError(403, 'permission_denied');
    await client.query("DELETE FROM provider_connections WHERE organization_id = $1 AND provider = 'openai'", [session.activeOrganizationId]);
    await writeAudit(client, request, session, 'integration.openai.removed');
    return { configured: false };
  });
});

app.get('/api/v1/agents/assistant/runs', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return withTenant(session, async (client) => {
    const result = await client.query<{
      id: string; status: string; prompt: string; response: string | null; error_code: string | null;
      model: string; input_tokens: number | null; output_tokens: number | null; created_at: Date; completed_at: Date | null;
    }>(
      `SELECT id, status, prompt, response, error_code, model, input_tokens, output_tokens, created_at, completed_at
       FROM agent_runs WHERE organization_id = $1 AND requested_by = $2
       ORDER BY created_at DESC LIMIT 30`,
      [session.activeOrganizationId, session.userId],
    );
    return { runs: result.rows };
  });
});

app.get('/api/v1/agents/:slug/runs', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const slug = (request.params as { slug?: string }).slug;
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return reply.code(400).send({ error: 'invalid_input' });
  return withTenant(session, async (client) => {
    const result = await client.query(
      `SELECT id, status, prompt, response, error_code, model, input_tokens, output_tokens, created_at, completed_at
       FROM agent_runs WHERE organization_id = $1 AND requested_by = $2 AND agent_slug = $3
       ORDER BY created_at DESC LIMIT 30`,
      [session.activeOrganizationId, session.userId, slug],
    );
    return { runs: result.rows };
  });
});

app.get('/api/v1/agents', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return withTenant(session, async (client) => {
    const result = await client.query<{
      slug: string; version: number; name: string; category: string; description: string;
      default_model: string; required_provider: string; installed_status: 'active' | 'paused' | null;
    }>(
      `SELECT template.slug, template.version, template.name, template.category, template.description,
              template.default_model, template.required_provider, tenant_agent.status AS installed_status
       FROM agent_templates template
       LEFT JOIN tenant_agents tenant_agent
         ON tenant_agent.template_slug = template.slug AND tenant_agent.organization_id = $1
       WHERE template.status = 'active' ORDER BY template.name`,
      [session.activeOrganizationId],
    );
    return { agents: result.rows };
  });
});

app.get('/api/v1/my-agents', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return withTenant(session, async (client) => {
    const result = await client.query(
      `SELECT template.slug, template.version, template.name, template.category, template.description,
              template.default_model, tenant_agent.status, tenant_agent.installed_version, tenant_agent.created_at
       FROM tenant_agents tenant_agent
       JOIN agent_templates template ON template.slug = tenant_agent.template_slug AND template.version = tenant_agent.installed_version
       WHERE tenant_agent.organization_id = $1 ORDER BY tenant_agent.created_at DESC`,
      [session.activeOrganizationId],
    );
    return { agents: result.rows };
  });
});

app.post('/api/v1/agents/:slug/install', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const slug = (request.params as { slug?: string }).slug;
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return reply.code(400).send({ error: 'invalid_input' });
  return withTenant(session, async (client, role) => {
    if (role === 'viewer') throw new HttpError(403, 'permission_denied');
    const template = await client.query<{ version: number }>(
      `SELECT version FROM agent_templates WHERE slug = $1 AND status = 'active' ORDER BY version DESC LIMIT 1`,
      [slug],
    );
    const current = template.rows[0];
    if (!current) throw new HttpError(404, 'agent_not_available');
    const installed = await client.query(
      `INSERT INTO tenant_agents (id, organization_id, template_slug, installed_version, installed_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, template_slug) DO NOTHING
       RETURNING id`,
      [randomUUID(), session.activeOrganizationId, slug, current.version, session.userId],
    );
    if (installed.rowCount) await writeAudit(client, request, session, 'agent.installed', { agent: slug, version: current.version });
    const currentStatus = await client.query<{ status: string }>(
      'SELECT status FROM tenant_agents WHERE organization_id = $1 AND template_slug = $2',
      [session.activeOrganizationId, slug],
    );
    return reply.code(installed.rowCount ? 201 : 200).send({ slug, installed: true, status: currentStatus.rows[0]?.status });
  });
});

app.patch('/api/v1/my-agents/:slug', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const slug = (request.params as { slug?: string }).slug;
  const parsed = tenantAgentStatusSchema.safeParse(request.body);
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !parsed.success) return reply.code(400).send({ error: 'invalid_input' });
  return withTenant(session, async (client, role) => {
    if (role === 'viewer') throw new HttpError(403, 'permission_denied');
    const result = await client.query<{ status: 'active' | 'paused' }>(
      `UPDATE tenant_agents SET status = $1, updated_at = now()
       WHERE organization_id = $2 AND template_slug = $3 RETURNING status`,
      [parsed.data.status, session.activeOrganizationId, slug],
    );
    const current = result.rows[0];
    if (!current) throw new HttpError(404, 'agent_not_installed');
    await writeAudit(client, request, session, `agent.${parsed.data.status === 'active' ? 'resumed' : 'paused'}`, { agent: slug });
    return { slug, status: current.status };
  });
});

app.get('/api/v1/workflows', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return withTenant(session, async (client) => {
    const result = await client.query(
      `SELECT workflow.id, workflow.name, workflow.description, workflow.status, workflow.definition,
              workflow.created_at, workflow.updated_at,
              (SELECT count(*)::int FROM workflow_runs WHERE workflow_id = workflow.id) AS run_count
       FROM tenant_workflows workflow WHERE workflow.organization_id = $1
       ORDER BY workflow.updated_at DESC`,
      [session.activeOrganizationId],
    );
    return { workflows: result.rows };
  });
});

app.post('/api/v1/workflows', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const parsed = workflowSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_workflow' });
  return withTenant(session, async (client, role) => {
    if (role === 'viewer') throw new HttpError(403, 'permission_denied');
    const id = randomUUID();
    const result = await client.query(
      `INSERT INTO tenant_workflows (id, organization_id, name, description, definition, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id, name, description, status, definition, created_at, updated_at`,
      [id, session.activeOrganizationId, parsed.data.name, parsed.data.description, JSON.stringify({ nodes: parsed.data.nodes }), session.userId],
    );
    await writeAudit(client, request, session, 'workflow.created', { workflow_id: id, name: parsed.data.name });
    return reply.code(201).send({ workflow: result.rows[0] });
  });
});

app.put('/api/v1/workflows/:id', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const id = (request.params as { id?: string }).id;
  const parsed = workflowSchema.safeParse(request.body);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !parsed.success) return reply.code(400).send({ error: 'invalid_workflow' });
  return withTenant(session, async (client, role) => {
    if (role === 'viewer') throw new HttpError(403, 'permission_denied');
    const result = await client.query(
      `UPDATE tenant_workflows SET name = $1, description = $2, definition = $3::jsonb, updated_at = now()
       WHERE id = $4 AND organization_id = $5
       RETURNING id, name, description, status, definition, created_at, updated_at`,
      [parsed.data.name, parsed.data.description, JSON.stringify({ nodes: parsed.data.nodes }), id, session.activeOrganizationId],
    );
    const workflow = result.rows[0];
    if (!workflow) throw new HttpError(404, 'workflow_not_found');
    await writeAudit(client, request, session, 'workflow.updated', { workflow_id: id });
    return { workflow };
  });
});

app.patch('/api/v1/workflows/:id/status', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const id = (request.params as { id?: string }).id;
  const parsed = workflowStatusSchema.safeParse(request.body);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !parsed.success) return reply.code(400).send({ error: 'invalid_input' });
  if (parsed.data.status === 'active') throw new HttpError(409, 'workflow_triggers_not_configured');
  return withTenant(session, async (client, role) => {
    if (role === 'viewer') throw new HttpError(403, 'permission_denied');
    const result = await client.query<{ id: string; status: string }>(
      `UPDATE tenant_workflows SET status = $1, updated_at = now()
       WHERE id = $2 AND organization_id = $3 RETURNING id, status`,
      [parsed.data.status, id, session.activeOrganizationId],
    );
    const workflow = result.rows[0];
    if (!workflow) throw new HttpError(404, 'workflow_not_found');
    await writeAudit(client, request, session, 'workflow.status_changed', { workflow_id: id, status: workflow.status });
    return { workflow };
  });
});

app.get('/api/v1/workflows/:id/runs', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const id = (request.params as { id?: string }).id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'invalid_input' });
  return withTenant(session, async (client) => {
    const result = await client.query(
      `SELECT id, status, trace, created_at FROM workflow_runs
       WHERE organization_id = $1 AND workflow_id = $2 ORDER BY created_at DESC LIMIT 20`,
      [session.activeOrganizationId, id],
    );
    return { runs: result.rows };
  });
});

app.post('/api/v1/workflows/:id/run', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const id = (request.params as { id?: string }).id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'invalid_input' });
  return withTenant(session, async (client, role) => {
    if (role === 'viewer') throw new HttpError(403, 'permission_denied');
    const result = await client.query<{ name: string; definition: { nodes?: unknown } }>(
      'SELECT name, definition FROM tenant_workflows WHERE id = $1 AND organization_id = $2',
      [id, session.activeOrganizationId],
    );
    const workflow = result.rows[0];
    if (!workflow) throw new HttpError(404, 'workflow_not_found');
    const parsed = workflowSchema.safeParse({ name: workflow.name, description: '', nodes: workflow.definition.nodes });
    if (!parsed.success) throw new HttpError(409, 'workflow_configuration_invalid');
    const hasProvider = await client.query(
      "SELECT 1 FROM provider_connections WHERE organization_id = $1 AND provider = 'openai'",
      [session.activeOrganizationId],
    );
    const installedAgents = new Map<string, 'active' | 'paused'>();
    const slugs = [...new Set(parsed.data.nodes.filter((node) => node.type === 'agent').map((node) => node.type === 'agent' ? node.agentSlug : ''))];
    if (slugs.length) {
      const installations = await client.query<{ template_slug: string; status: 'active' | 'paused' }>(
        'SELECT template_slug, status FROM tenant_agents WHERE organization_id = $1 AND template_slug = ANY($2::text[])',
        [session.activeOrganizationId, slugs],
      );
      for (const installation of installations.rows) installedAgents.set(installation.template_slug, installation.status);
    }
    const trace = parsed.data.nodes.map((node) => {
      if (node.type === 'trigger') return { id: node.id, label: node.label, status: 'ready', detail: 'Manueller Auslöser erkannt.' };
      if (node.type === 'approval') return { id: node.id, label: node.label, status: 'ready', detail: 'Freigabeschritt vorgesehen; in diesem Probelauf wird keine Freigabe angefordert.' };
      const installed = installedAgents.get(node.agentSlug);
      if (!installed) return { id: node.id, label: node.label, status: 'blocked', detail: 'Agent ist in dieser Organisation nicht installiert.' };
      if (installed === 'paused') return { id: node.id, label: node.label, status: 'blocked', detail: 'Agent ist pausiert.' };
      if (!hasProvider.rowCount) return { id: node.id, label: node.label, status: 'blocked', detail: 'OpenAI-Verbindung fehlt.' };
      return { id: node.id, label: node.label, status: 'ready', detail: 'Agent installiert, OpenAI-Zugang hinterlegt; dessen Gültigkeit wird im Probelauf nicht extern geprüft.' };
    });
    const status = trace.some((step) => step.status === 'blocked') ? 'blocked' : 'validated';
    const runId = randomUUID();
    await client.query(
      `INSERT INTO workflow_runs (id, organization_id, workflow_id, requested_by, status, trace)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [runId, session.activeOrganizationId, id, session.userId, status, JSON.stringify(trace)],
    );
    await writeAudit(client, request, session, 'workflow.dry_run', { workflow_id: id, run_id: runId, status });
    return { run: { id: runId, status, trace, message: 'Probelauf: Konfiguration geprüft. Es wurden keine KI-Anfragen und keine externen Aktionen ausgeführt.' } };
  });
});

const runAgent = async (request: FastifyRequest, reply: FastifyReply, agentSlug: string) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(agentSlug)) return reply.code(400).send({ error: 'invalid_input' });
  const parsed = assistantRunSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
  if (!session.activeOrganizationId) throw new HttpError(403, 'organization_access_required');

  const runId = randomUUID();
  const { key, template } = await withTenant(session, async (client, role) => {
    if (role === 'viewer') throw new HttpError(403, 'permission_denied');
    const installation = await client.query<{ status: string }>(
      'SELECT status FROM tenant_agents WHERE organization_id = $1 AND template_slug = $2',
      [session.activeOrganizationId, agentSlug],
    );
    if (!installation.rows[0]) throw new HttpError(409, 'agent_not_installed');
    if (installation.rows[0].status !== 'active') throw new HttpError(409, 'agent_paused');
    const connection = await client.query<EncryptedSecret>(
      `SELECT secret_ciphertext AS ciphertext, secret_iv AS iv, secret_tag AS tag
       FROM provider_connections WHERE organization_id = $1 AND provider = 'openai'`,
      [session.activeOrganizationId],
    );
    const storedSecret = connection.rows[0];
    if (!storedSecret) throw new HttpError(409, 'provider_not_configured');
    const templateResult = await client.query<{ instructions: string; default_model: string; max_output_tokens: number }>(
      `SELECT instructions, default_model, max_output_tokens FROM agent_templates
       WHERE slug = $1 AND status = 'active' ORDER BY version DESC LIMIT 1`,
      [agentSlug],
    );
    const activeTemplate = templateResult.rows[0];
    if (!activeTemplate) throw new HttpError(404, 'agent_not_available');
    await client.query(
      `INSERT INTO agent_runs (id, organization_id, requested_by, agent_slug, status, prompt)
       VALUES ($1, $2, $3, $4, 'running', $5)`,
      [runId, session.activeOrganizationId, session.userId, agentSlug, parsed.data.prompt],
    );
    return { key: decryptSecret(storedSecret), template: activeTemplate };
  });

  try {
    const providerResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: template.default_model,
        instructions: template.instructions,
        input: parsed.data.prompt,
        max_output_tokens: template.max_output_tokens,
        store: false,
        safety_identifier: createHash('sha256').update(session.userId).digest('hex'),
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!providerResponse.ok) {
      const code = providerResponse.status === 401 || providerResponse.status === 403
        ? 'provider_auth_failed'
        : providerResponse.status === 429 ? 'provider_rate_limited' : 'provider_request_failed';
      throw new HttpError(502, code);
    }
    const body = await providerResponse.json() as {
      id?: string;
      output?: { type?: string; content?: { type?: string; text?: string }[] }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const answer = body.output?.flatMap((item) => item.type === 'message' ? (item.content ?? []) : [])
      .filter((content) => content.type === 'output_text')
      .map((content) => content.text ?? '')
      .join('\n').trim();
    if (!answer) throw new HttpError(502, 'provider_empty_response');

    await inTransaction(async (client) => {
      await setRequestContext(client, session.userId, session.activeOrganizationId);
      await client.query(
        `UPDATE agent_runs SET status = 'completed', response = $1, provider_response_id = $2,
         input_tokens = $3, output_tokens = $4, completed_at = now() WHERE id = $5 AND organization_id = $6`,
        [answer.slice(0, 20_000), body.id ?? null, body.usage?.input_tokens ?? null, body.usage?.output_tokens ?? null, runId, session.activeOrganizationId],
      );
      await writeAudit(client, request, session, 'agent.run.completed', { agent: agentSlug, run_id: runId });
    });
    return { run: { id: runId, status: 'completed', response: answer, model: template.default_model, agent: agentSlug } };
  } catch (error) {
    const safeCode = error instanceof HttpError ? error.code : 'provider_unavailable';
    await inTransaction(async (client) => {
      await setRequestContext(client, session.userId, session.activeOrganizationId);
      await client.query(
        `UPDATE agent_runs SET status = 'failed', error_code = $1, completed_at = now() WHERE id = $2 AND organization_id = $3`,
        [safeCode, runId, session.activeOrganizationId],
      );
      await writeAudit(client, request, session, 'agent.run.failed', { agent: agentSlug, run_id: runId, error: safeCode });
    });
    throw error instanceof HttpError ? error : new HttpError(502, 'provider_unavailable');
  }
};

app.post('/api/v1/agents/:slug/run', {
  config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
}, async (request, reply) => runAgent(request, reply, (request.params as { slug?: string }).slug ?? ''));

app.post('/api/v1/agents/assistant/run', {
  config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
}, async (request, reply) => runAgent(request, reply, 'workspace-assistant'));

async function start(): Promise<void> {
  await redis.connect();
  await redis.ping();
  await pool.query('SELECT 1');
  await app.listen({ host: '0.0.0.0', port: config.PORT });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  });
}

start().catch(async (error: unknown) => {
  app.log.error({ err: error }, 'API startup failed');
  await redis.quit().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
