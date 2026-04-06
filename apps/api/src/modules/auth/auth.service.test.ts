import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, hashRefreshToken } from './auth.service';

describe('auth.service helpers', () => {
  it('hashes and verifies passwords', () => {
    const password = 'passwordOne';
    const hashed = hashPassword(password);

    expect(verifyPassword(password, hashed)).toBe(true);
    expect(verifyPassword('wrongPassword', hashed)).toBe(false);
  });

  it('generates deterministic refresh token hashes', () => {
    const token = 'refresh-token';
    const one = hashRefreshToken(token);
    const two = hashRefreshToken(token);

    expect(one).toBe(two);
    expect(one).not.toBe(hashRefreshToken('different-token'));
  });
});
