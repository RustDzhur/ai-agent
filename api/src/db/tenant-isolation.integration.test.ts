import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.RUN_DB_INTEGRATION === '1';

describe.skipIf(!enabled)('PostgreSQL tenant isolation', () => {
  let client: pg.PoolClient;
  const connectionPool = new pg.Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });

  beforeAll(async () => {
    client = await connectionPool.connect();
    await client.query('BEGIN');
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    await connectionPool.end();
  });

  it('hides another organization and rejects its audit writes', async () => {
    const userA = randomUUID();
    const userB = randomUUID();
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    await client.query('INSERT INTO users (id, full_name, email, password_hash) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)', [
      userA, 'Tenant A', `${userA}@example.invalid`, 'integration-test-hash',
      userB, 'Tenant B', `${userB}@example.invalid`, 'integration-test-hash',
    ]);

    await client.query("SELECT set_config('app.user_id', $1, true)", [userA]);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
    await client.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [tenantA, 'Tenant A']);
    await client.query("INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')", [tenantA, userA]);
    await client.query(
      `INSERT INTO provider_connections (organization_id, provider, secret_ciphertext, secret_iv, secret_tag, secret_hint)
       VALUES ($1, 'openai', decode('01','hex'), decode('02','hex'), decode('03','hex'), 'test')`,
      [tenantA],
    );
    await client.query(
      `INSERT INTO agent_runs (id, organization_id, requested_by, agent_slug, status, prompt, response)
       VALUES ($1, $2, $3, 'workspace-assistant', 'completed', 'private prompt', 'private response')`,
      [randomUUID(), tenantA, userA],
    );

    await client.query("SELECT set_config('app.user_id', $1, true)", [userB]);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantB]);
    await client.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [tenantB, 'Tenant B']);
    await client.query("INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')", [tenantB, userB]);

    const hiddenCredentials = await client.query('SELECT organization_id FROM provider_connections WHERE organization_id = $1', [tenantA]);
    const hiddenRuns = await client.query('SELECT organization_id FROM agent_runs WHERE organization_id = $1', [tenantA]);
    expect(hiddenCredentials.rowCount).toBe(0);
    expect(hiddenRuns.rowCount).toBe(0);

    await client.query("SELECT set_config('app.user_id', $1, true)", [userA]);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
    const visibleOrganizations = await client.query<{ id: string }>('SELECT id FROM organizations ORDER BY id');
    expect(visibleOrganizations.rows.map((row) => row.id)).toEqual([tenantA]);

    await client.query('SAVEPOINT cross_tenant_write');
    await expect(client.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, request_id, action)
       VALUES ($1, $2, $3, $4, 'integration.cross_tenant')`,
      [randomUUID(), tenantB, userA, randomUUID()],
    )).rejects.toMatchObject({ code: '42501' });
    await client.query('ROLLBACK TO SAVEPOINT cross_tenant_write');
  });
});
