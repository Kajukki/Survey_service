import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Config } from './config';
import { UnauthorizedError } from './errors';
import type { Principal } from './types';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

function readBearerToken(authorizationHeader: string | string[] | undefined): string | null {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }

  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);
  if (scheme !== 'Bearer' || !token || rest.length > 0) {
    return null;
  }

  return token;
}

export function getPrincipal(request: FastifyRequest): Principal {
  if (!request.principal) {
    throw new UnauthorizedError('Authentication required');
  }

  return request.principal;
}

export async function registerPrincipalPlugin(app: FastifyInstance, config: Config): Promise<void> {
  app.decorateRequest('principal', null);

  const localSecret = config.AUTH_JWT_SECRET
    ? new TextEncoder().encode(config.AUTH_JWT_SECRET)
    : null;
  const remoteJwks =
    config.AUTH_MODE === 'oidc' && config.OIDC_JWKS_URI
      ? createRemoteJWKSet(new URL(config.OIDC_JWKS_URI))
      : null;

  app.addHook('onRequest', async (request) => {
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      return;
    }

    try {
      const payload = await (async () => {
        if (config.AUTH_MODE === 'oidc') {
          if (!remoteJwks) {
            throw new UnauthorizedError('OIDC JWKS verifier is not configured');
          }

          const result = await jwtVerify(token, remoteJwks, {
            issuer: config.OIDC_ISSUER,
            audience: config.OIDC_AUDIENCE,
          });
          return result.payload;
        }

        if (!localSecret) {
          throw new UnauthorizedError('Local JWT verifier is not configured');
        }

        const result = await jwtVerify(token, localSecret, {
          issuer: config.OIDC_ISSUER,
          audience: config.OIDC_AUDIENCE,
        });
        return result.payload;
      })();

      if (typeof payload.sub !== 'string') {
        throw new UnauthorizedError('Invalid access token');
      }

      const orgId = typeof payload.org === 'string' ? payload.org : null;
      if (!orgId) {
        throw new UnauthorizedError('Invalid access token');
      }

      request.principal = {
        userId: payload.sub,
        orgId,
        token,
      };
    } catch {
      throw new UnauthorizedError('Invalid access token');
    }
  });
}
