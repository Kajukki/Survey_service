import { FastifyInstance } from 'fastify';
import { CreateConnectionSchema } from '@survey-service/contracts';
import { getPrincipal } from '../../server/principal';
import type { Config } from '../../server/config';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { createProviderCredentialCrypto } from '../providers/google/credential-crypto';
import { createConnectionsRepository } from './connections.repository';
import { mapConnectionRow } from './connections.query-service';

import { ZodTypeProvider } from 'fastify-type-provider-zod';


function createTokenSetFromCredentialToken(input: {
  provider: 'google' | 'microsoft';
  credentialToken: string;
}) {
  return {
    provider: input.provider,
    accessToken: input.credentialToken,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    tokenType: 'Bearer',
  } as const;
}

export async function connectionsRoutes(
  app: FastifyInstance,
  deps: { db: Kysely<Database>; config: Config },
) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  const repository = createConnectionsRepository(deps.db);

  // GET /connections
  zApp.get('/connections', async (request, reply) => {
    const principal = getPrincipal(request);
    const connections = (await repository.listConnectionsForOwner(principal.userId)).map(
      mapConnectionRow,
    );

    return reply.send({
      success: true,
      data: connections,
      meta: {
        requestId: request.id,
        pagination: { page: 1, perPage: 20, total: connections.length, totalPages: 1 },
      },
    });
  });

  // POST /connections
  zApp.post(
    '/connections',
    {
      schema: {
        body: CreateConnectionSchema,
      },
    },
    async (request, reply) => {
      const principal = getPrincipal(request);
      const payload = request.body as {
        type: 'google' | 'microsoft';
        name: string;
        externalId: string;
        credentialToken: string;
      };

      const credentialCrypto = createProviderCredentialCrypto({
        base64Key: deps.config.CREDENTIAL_ENCRYPTION_KEY_B64,
        keyVersion: deps.config.CREDENTIAL_ENCRYPTION_KEY_VERSION,
      });

      const tokenSet = createTokenSetFromCredentialToken({
        provider: payload.type,
        credentialToken: payload.credentialToken,
      });

      const encrypted = credentialCrypto.encrypt({
        tokenSet,
        idToken: '',
      });

      const created = await repository.createConnection({
        ownerId: principal.userId,
        orgId: principal.orgId,
        provider: payload.type,
        externalAccountId: payload.externalId,
        name: payload.name,
        encryptedTokenPayload: encrypted.encryptedTokenPayload,
        encryptedTokenIv: encrypted.encryptedTokenIv,
        encryptedTokenTag: encrypted.encryptedTokenTag,
        encryptedTokenKeyVersion: encrypted.encryptedTokenKeyVersion,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        expiresAt: new Date(tokenSet.expiresAt),
        scope: null,
        tokenType: tokenSet.tokenType,
      });

      return reply.status(201).send({
        success: true,
        data: mapConnectionRow(created),
        meta: {
          requestId: request.id,
        },
      });
    },
  );

  // DELETE /connections/:id
  zApp.delete('/connections/:id', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    if (!id) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Connection id is required',
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const existingId = await repository.deleteConnectionByOwner(id, principal.userId);
    if (!existingId) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'not_found',
          message: 'Connection not found',
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    return reply.status(204).send();
  });
}
