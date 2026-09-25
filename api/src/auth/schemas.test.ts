import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './schemas.js';

describe('account input validation', () => {
  it('normalizes email and accepts a valid registration', () => {
    const result = registerSchema.parse({
      fullName: 'Rustem Dzhur',
      email: '  USER@Example.eu ',
      password: 'a-long-password-2026',
      organizationName: 'Example GmbH',
    });
    expect(result.email).toBe('user@example.eu');
  });

  it('rejects short passwords and unknown input fields', () => {
    expect(registerSchema.safeParse({
      fullName: 'A',
      email: 'a@example.eu',
      password: 'short',
      organizationName: 'AB',
      role: 'owner',
    }).success).toBe(false);
  });

  it('does not accept an invalid login email', () => {
    expect(loginSchema.safeParse({ email: 'invalid', password: 'long-enough' }).success).toBe(false);
  });
});
