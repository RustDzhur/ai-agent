import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptedSecret = { ciphertext: Buffer; iv: Buffer; tag: Buffer };

function encryptionKey(): Buffer {
  const encoded = process.env.APP_ENCRYPTION_KEY;
  if (!encoded) throw new Error('APP_ENCRYPTION_KEY is not configured');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must encode exactly 32 bytes');
  return key;
}

export function encryptSecret(secret: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), secret.iv);
  decipher.setAuthTag(secret.tag);
  return Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]).toString('utf8');
}
