import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { getPrincipal } from '../../../server/principal';
import {
  createDefaultGoogleAuthService,
  type GoogleAuthService,
} from './google-auth.service';

const GoogleAuthStartBodySchema = z.object({
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(1),
  codeChallengeMethod: z.literal('S256'),
  scopes: z.array(z.string().min(1)).optional(),
});

const GoogleAuthCallbackBodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  redirectUri: z.string().url(),
  externalAccountId: z.string().min(1).optional(),
  connectionName: z.string().min(1).max(255).optional(),
});

export async function registerGoogleAuthRoutes(
  app: FastifyInstance,
  deps?: {
    service?: GoogleAuthService;
    db?: Kysely<Database>;
  },
): Promise<void> {
  const service = deps?.service ?? createDefaultGoogleAuthService(deps?.db);

  app.post('/providers/google/auth/start', async (request, reply) => {
    const principal = getPrincipal(request);
    const bodyResult = GoogleAuthStartBodySchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Invalid provider auth start payload',
          details: {
            issues: bodyResult.error.issues,
          },
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const result = await service.startAuthorization({
      principal: {
        userId: principal.userId,
        orgId: principal.orgId,
      },
      input: bodyResult.data,
    });

    return reply.send({
      success: true,
      data: result,
      meta: {
        requestId: request.id,
      },
    });
  });

  app.post('/providers/google/auth/callback', async (request, reply) => {
    const principal = getPrincipal(request);
    const bodyResult = GoogleAuthCallbackBodySchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Invalid provider auth callback payload',
          details: {
            issues: bodyResult.error.issues,
          },
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const result = await service.completeAuthorization({
      principal: {
        userId: principal.userId,
        orgId: principal.orgId,
      },
      input: bodyResult.data,
    });

    return reply.status(201).send({
      success: true,
      data: result,
      meta: {
        requestId: request.id,
      },
    });
  });
}
