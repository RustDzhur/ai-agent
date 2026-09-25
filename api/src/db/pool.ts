import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  host: config.PGHOST,
  port: config.PGPORT,
  database: config.PGDATABASE,
  user: config.PGUSER,
  password: config.PGPASSWORD,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  application_name: 'firmspace-ai-api',
});

export type DbClient = pg.PoolClient;

export async function inTransaction<T>(operation: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function setRequestContext(client: DbClient, userId: string, organizationId?: string | null): Promise<void> {
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
  if (organizationId) {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [organizationId]);
  }
}
