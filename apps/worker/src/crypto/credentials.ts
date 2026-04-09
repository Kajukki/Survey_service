import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { WorkerConfig } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

export interface ProviderTokenSetLike {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
  tokenType?: string;
}

export interface EncryptedCredentialPayload {
  tokenSet: ProviderTokenSetLike;
  idToken: string;
}

export interface ProviderConnectionCredentials {
  encrypted_token_payload: string | null;
  encrypted_token_iv: string | null;
  encrypted_token_tag: string | null;
}

export function decryptCredentialPayload(
  config: WorkerConfig,
  connection: ProviderConnectionCredentials,
): EncryptedCredentialPayload {
  if (
    !connection.encrypted_token_payload ||
    !connection.encrypted_token_iv ||
    !connection.encrypted_token_tag
  ) {
    throw new Error('Provider connection is missing encrypted credential payload fields');
  }

  const key = Buffer.from(config.CREDENTIAL_ENCRYPTION_KEY_B64, 'base64');
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(connection.encrypted_token_iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(connection.encrypted_token_tag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(connection.encrypted_token_payload, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  const parsed = JSON.parse(plaintext) as EncryptedCredentialPayload;
  if (!parsed?.tokenSet?.accessToken || !parsed?.tokenSet?.expiresAt || !parsed?.idToken) {
    throw new Error('Decrypted provider credentials payload is invalid');
  }

  return parsed;
}

export function encryptCredentialPayload(
  config: WorkerConfig,
  payload: EncryptedCredentialPayload,
): {
  encryptedTokenPayload: string;
  encryptedTokenIv: string;
  encryptedTokenTag: string;
  encryptedTokenKeyVersion: string;
} {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const key = Buffer.from(config.CREDENTIAL_ENCRYPTION_KEY_B64, 'base64');
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encoded = JSON.stringify(payload);
  const ciphertext = Buffer.concat([cipher.update(encoded, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedTokenPayload: ciphertext.toString('base64'),
    encryptedTokenIv: iv.toString('base64'),
    encryptedTokenTag: authTag.toString('base64'),
    encryptedTokenKeyVersion: config.CREDENTIAL_ENCRYPTION_KEY_VERSION,
  };
}

export function isTokenExpiringSoon(expiresAt: string, thresholdMs: number = 60_000): boolean {
  const value = Date.parse(expiresAt);
  if (!Number.isFinite(value)) {
    return true;
  }

  return value <= Date.now() + thresholdMs;
}
