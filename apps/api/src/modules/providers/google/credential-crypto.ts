import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ProviderTokenSet } from '@survey-service/contracts';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

interface EncryptedCredentialPayload {
  tokenSet: ProviderTokenSet;
  idToken: string;
}

export interface EncryptedCredentialRecord {
  encryptedTokenPayload: string;
  encryptedTokenIv: string;
  encryptedTokenTag: string;
  encryptedTokenKeyVersion: string;
}

export interface ProviderCredentialCrypto {
  encrypt(input: EncryptedCredentialPayload): EncryptedCredentialRecord;
  decrypt(input: EncryptedCredentialRecord): EncryptedCredentialPayload;
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, 'base64');
}

export function createProviderCredentialCrypto(input: {
  base64Key: string;
  keyVersion: string;
}): ProviderCredentialCrypto {
  const key = fromBase64(input.base64Key);
  if (key.length !== 32) {
    throw new Error('Provider credential encryption key must decode to 32 bytes');
  }

  return {
    encrypt(payload) {
      const iv = randomBytes(IV_LENGTH_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);

      const encoded = JSON.stringify(payload);
      const ciphertext = Buffer.concat([cipher.update(encoded, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return {
        encryptedTokenPayload: toBase64(ciphertext),
        encryptedTokenIv: toBase64(iv),
        encryptedTokenTag: toBase64(authTag),
        encryptedTokenKeyVersion: input.keyVersion,
      };
    },

    decrypt(record) {
      const decipher = createDecipheriv(ALGORITHM, key, fromBase64(record.encryptedTokenIv));
      decipher.setAuthTag(fromBase64(record.encryptedTokenTag));

      const plaintext = Buffer.concat([
        decipher.update(fromBase64(record.encryptedTokenPayload)),
        decipher.final(),
      ]).toString('utf8');

      const parsed = JSON.parse(plaintext) as EncryptedCredentialPayload;
      return parsed;
    },
  };
}
