import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  PGHOST: z.string().min(1),
  PGPORT: z.coerce.number().int().min(1).max(65_535).default(5432),
  PGDATABASE: z.string().min(1),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().min(1).refine((value) => Buffer.from(value, 'base64').length === 32, 'must encode exactly 32 bytes'),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().min(1).max(65_535).default(6379),
  REDIS_USERNAME: z.string().min(1),
  REDIS_PASSWORD: z.string().min(1),
  APP_ORIGINS: z.string().min(1),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid runtime configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
}

export const config = {
  ...parsed.data,
  origins: new Set(parsed.data.APP_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)),
  cookieSecure: parsed.data.COOKIE_SECURE === 'true',
};
