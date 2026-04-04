/**
 * Authentication and principal extraction from JWT bearers.
 */
import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { Logger } from 'pino';
import type { Principal } from '../server/types';
import type { Config } from '../server/config';
import { UnauthorizedError } from '../server/errors';

/**
 * JWT payload schema expected from OIDC provider.
 */
interface JWTPayload {
  sub: string; // subject (user ID)
  aud: string | string[]; // audience
  iss: string; // issuer
  org?: string; // optional org claim
  exp?: number; // expiration
  iat?: number; // issued at
}

/**
 * Extract authorization header bearer token.
 */
export function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader) {
    throw new UnauthorizedError('Missing authorization header');
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Invalid authorization header format');
  }

  return token;
}

/**
 * Verify JWT and extract principal information.
 * Uses remote JWKS for signature verification.
 */
export async function verifyJWT(token: string, config: Config, logger: Logger): Promise<Principal> {
  try {
    const JWKS = createRemoteJWKSet(new URL(config.OIDC_JWKS_URI));

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: config.OIDC_ISSUER,
      audience: config.OIDC_AUDIENCE,
    });

    const jwtPayload = payload as unknown as JWTPayload;

    if (!jwtPayload.sub) {
      logger.warn('JWT missing sub claim');
      throw new UnauthorizedError('Invalid token: missing subject');
    }

    return {
      userId: jwtPayload.sub,
      orgId: jwtPayload.org || 'default',
      token,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    logger.warn({ error }, 'JWT verification failed');
    throw new UnauthorizedError('Invalid token');
  }
}

/**
 * Create a mock principal for testing or development.
 * ONLY use in development mode.
 */
export function createMockPrincipal(userId: string, orgId: string = 'test-org'): Principal {
  return {
    userId,
    orgId,
  };
}
