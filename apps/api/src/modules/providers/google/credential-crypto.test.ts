import { describe, expect, it } from 'vitest';
import { createProviderCredentialCrypto } from './credential-crypto';

const base64Key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

describe('provider credential crypto', () => {
  it('encrypts and decrypts credential payloads', () => {
    const crypto = createProviderCredentialCrypto({
      base64Key,
      keyVersion: 'v1',
    });

    const encrypted = crypto.encrypt({
      tokenSet: {
        provider: 'google',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2026-04-09T12:00:00.000Z',
        scope: 'scope-a scope-b',
        tokenType: 'Bearer',
      },
      idToken: 'id-token',
    });

    expect(encrypted.encryptedTokenPayload).not.toContain('access-token');
    expect(encrypted.encryptedTokenIv.length).toBeGreaterThan(0);
    expect(encrypted.encryptedTokenTag.length).toBeGreaterThan(0);
    expect(encrypted.encryptedTokenKeyVersion).toBe('v1');

    const decrypted = crypto.decrypt(encrypted);

    expect(decrypted.tokenSet.accessToken).toBe('access-token');
    expect(decrypted.tokenSet.refreshToken).toBe('refresh-token');
    expect(decrypted.idToken).toBe('id-token');
  });

  it('throws when key is not 32 bytes after base64 decode', () => {
    expect(() =>
      createProviderCredentialCrypto({
        base64Key: Buffer.from('short-key').toString('base64'),
        keyVersion: 'v1',
      }),
    ).toThrow();
  });
});
