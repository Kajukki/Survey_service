import { FastifyInstance } from 'fastify';
import { CreateConnectionSchema } from '@survey-service/contracts';
import { getPrincipal } from '../../server/principal';
import type { Config } from '../../server/config';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { createProviderCredentialCrypto } from '../providers/google/credential-crypto';

import { ZodTypeProvider } from 'fastify-type-provider-zod';

interface DbConnectionRow {
  id: string;
  owner_id: string;
  provider: 'google' | 'microsoft';
  external_account_id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapDbConnection(row: DbConnectionRow) {
  return {
    id: row.id,
    type: row.provider,
    name: row.name,
    externalId: row.external_account_id,
    ownerId: row.owner_id,
    syncStatus: 'idle' as const,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

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

  // GET /connections
  zApp.get('/connections', async (request, reply) => {
    const principal = getPrincipal(request);

    const connections = (
      await deps.db
        .selectFrom('provider_connections')
        .select([
          'id',
          'owner_id',
          'provider',
          'external_account_id',
          'name',
          'created_at',
          'updated_at',
        ])
        .where('owner_id', '=', principal.userId)
        .execute()
    ).map((row) => mapDbConnection(row as DbConnectionRow));

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

      const created = await deps.db
        .insertInto('provider_connections')
        .values({
          owner_id: principal.userId,
          org_id: principal.orgId,
          provider: payload.type,
          external_account_id: payload.externalId,
          name: payload.name,
          encrypted_token_payload: encrypted.encryptedTokenPayload,
          encrypted_token_iv: encrypted.encryptedTokenIv,
          encrypted_token_tag: encrypted.encryptedTokenTag,
          encrypted_token_key_version: encrypted.encryptedTokenKeyVersion,
          access_token: null,
          refresh_token: null,
          id_token: null,
          expires_at: new Date(tokenSet.expiresAt),
          scope: null,
          token_type: tokenSet.tokenType,
        })
        .onConflict((oc) =>
          oc.columns(['provider', 'owner_id', 'external_account_id']).doUpdateSet({
            name: payload.name,
            encrypted_token_payload: encrypted.encryptedTokenPayload,
            encrypted_token_iv: encrypted.encryptedTokenIv,
            encrypted_token_tag: encrypted.encryptedTokenTag,
            encrypted_token_key_version: encrypted.encryptedTokenKeyVersion,
            access_token: null,
            refresh_token: null,
            id_token: null,
            expires_at: new Date(tokenSet.expiresAt),
            scope: null,
            token_type: tokenSet.tokenType,
            updated_at: new Date(),
          }),
        )
        .returning([
          'id',
          'owner_id',
          'provider',
          'external_account_id',
          'name',
          'created_at',
          'updated_at',
        ])
        .executeTakeFirstOrThrow();

      return reply.status(201).send({
        success: true,
        data: mapDbConnection(created as DbConnectionRow),
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

    const existing = await deps.db
      .deleteFrom('provider_connections')
      .where('id', '=', id)
      .where('owner_id', '=', principal.userId)
      .returning('id')
      .executeTakeFirst();

    if (!existing) {
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
