import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import type { Config } from '../../server/config';
import { ConflictError, UnauthorizedError } from '../../server/errors';
import type { AuthRepository, AuthUserRecord } from './auth.repository';

export interface AuthSessionUser {
  id: string;
  username: string;
  orgId: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthSessionUser;
}

export interface AuthService {
  register(input: { username: string; password: string }): Promise<AuthSession>;
  login(input: { username: string; password: string }): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
}

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_KEYLEN = 64;

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${SCRYPT_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, hashHex] = storedHash.split('$');
  if (algorithm !== SCRYPT_PREFIX || !salt || !hashHex) {
    return false;
  }

  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const stored = Buffer.from(hashHex, 'hex');

  if (stored.length !== candidate.length) {
    return false;
  }

  return timingSafeEqual(stored, candidate);
}

interface AuthServiceDeps {
  repository: AuthRepository;
  config: Config;
}

function toSessionUser(user: AuthUserRecord): AuthSessionUser {
  return {
    id: user.id,
    username: user.username,
    orgId: user.orgId,
  };
}

async function signAccessToken(user: AuthUserRecord, config: Config): Promise<string> {
  const secret = new TextEncoder().encode(config.AUTH_JWT_SECRET);

  return new SignJWT({
    org: user.orgId,
    username: user.username,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(config.OIDC_ISSUER)
    .setAudience(config.OIDC_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  async function createSessionForUser(user: AuthUserRecord): Promise<AuthSession> {
    const accessToken = await signAccessToken(user, deps.config);
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + deps.config.REFRESH_TOKEN_TTL_SECONDS * 1000);

    await deps.repository.createRefreshToken({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: deps.config.ACCESS_TOKEN_TTL_SECONDS,
      user: toSessionUser(user),
    };
  }

  return {
    async register(input) {
      const existing = await deps.repository.findUserByUsername(input.username);
      if (existing) {
        throw new ConflictError('Username is already in use');
      }

      const created = await deps.repository.createUser({
        username: input.username,
        passwordHash: hashPassword(input.password),
        orgId: 'default-org',
      });

      return createSessionForUser(created);
    },

    async login(input) {
      const user = await deps.repository.findUserByUsername(input.username);
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw new UnauthorizedError('Invalid username or password');
      }

      return createSessionForUser(user);
    },

    async refresh(refreshToken) {
      const hashed = hashRefreshToken(refreshToken);
      const existing = await deps.repository.findActiveRefreshTokenByHash(hashed);

      if (!existing) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      await deps.repository.revokeRefreshToken(existing.token.id);

      return createSessionForUser(existing.user);
    },
  };
}
