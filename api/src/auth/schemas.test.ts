import { describe, expect, it } from 'vitest';
import { assistantRunSchema, loginSchema, openAiCredentialSchema, registerSchema, tenantAgentStatusSchema } from './schemas.js';

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

describe('AI provider inputs', () => {
  it('accepts a scoped OpenAI project key and bounded text prompt', () => {
    expect(openAiCredentialSchema.safeParse({ apiKey: 'sk-proj-' + 'A'.repeat(28) }).success).toBe(true);
    expect(assistantRunSchema.safeParse({ prompt: 'Formuliere eine kurze Antwort.' }).success).toBe(true);
  });

  it('rejects malformed keys, extra provider settings and oversized prompts', () => {
    expect(openAiCredentialSchema.safeParse({ apiKey: 'not-a-key' }).success).toBe(false);
    expect(openAiCredentialSchema.safeParse({ apiKey: 'sk-' + 'A'.repeat(25), model: 'unexpected-model' }).success).toBe(false);
    expect(assistantRunSchema.safeParse({ prompt: 'x'.repeat(6001) }).success).toBe(false);
  });
});

describe('tenant agent controls', () => {
  it('accepts only an explicit active or paused status', () => {
    expect(tenantAgentStatusSchema.parse({ status: 'paused' })).toEqual({ status: 'paused' });
    expect(tenantAgentStatusSchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(tenantAgentStatusSchema.safeParse({ status: 'active', organizationId: 'other-tenant' }).success).toBe(false);
  });
});
