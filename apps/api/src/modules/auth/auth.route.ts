import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import {
  AuthLoginSchema,
  AuthRegisterSchema,
  AuthTokenRefreshSchema,
} from '@survey-service/contracts';
import type { Database } from '@survey-service/db';
import type { Config } from '../../server/config';
import { createAuthRepository } from './auth.repository';
import { createAuthService } from './auth.service';

export async function authRoutes(
  app: FastifyInstance,
  deps: {
    db: Kysely<Database>;
    config: Config;
  },
): Promise<void> {
  const repository = createAuthRepository(deps.db);
  const service = createAuthService({
    repository,
    config: deps.config,
  });

  app.post(
    '/auth/register',
    {
      schema: {
        body: AuthRegisterSchema,
      },
    },
    async (request, reply) => {
      const body = request.body as { username: string; password: string };
      const session = await service.register(body);

      return reply.status(201).send({
        success: true,
        data: session,
        meta: {
          requestId: request.id,
        },
      });
    },
  );

  app.post(
    '/auth/login',
    {
      schema: {
        body: AuthLoginSchema,
      },
    },
    async (request, reply) => {
      const body = request.body as { username: string; password: string };
      const session = await service.login(body);

      return reply.send({
        success: true,
        data: session,
        meta: {
          requestId: request.id,
        },
      });
    },
  );

  app.post(
    '/auth/refresh',
    {
      schema: {
        body: AuthTokenRefreshSchema,
      },
    },
    async (request, reply) => {
      const body = request.body as { refreshToken: string };
      const session = await service.refresh(body.refreshToken);

      return reply.send({
        success: true,
        data: session,
        meta: {
          requestId: request.id,
        },
      });
    },
  );
}
