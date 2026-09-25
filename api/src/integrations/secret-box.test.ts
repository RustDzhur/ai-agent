import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secret-box.js';

const previousKey = process.env.APP_ENCRYPTION_KEY;
afterEach(() => {
  if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = previousKey;
});

describe('secret encryption', () => {
  it('encrypts and decrypts a provider key with authenticated encryption', () => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const secret = 'sk-proj-example-provider-secret';
    const encrypted = encryptSecret(secret);
    expect(encrypted.ciphertext.toString('utf8')).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it('rejects ciphertext tampering', () => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const encrypted = encryptSecret('sk-proj-example-provider-secret');
    const tampered = Buffer.from(encrypted.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    encrypted.ciphertext = tampered;
    expect(() => decryptSecret(encrypted)).toThrow();
  });
});
