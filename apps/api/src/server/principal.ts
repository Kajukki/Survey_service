import type { FastifyInstance, FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';
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

export async function registerPrincipalPlugin(
  app: FastifyInstance,
  config: Config,
): Promise<void> {
  app.decorateRequest('principal', null);

  app.addHook('onRequest', async (request) => {
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      return;
    }

    try {
      const secret = new TextEncoder().encode(config.AUTH_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret, {
        issuer: config.OIDC_ISSUER,
        audience: config.OIDC_AUDIENCE,
      });

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