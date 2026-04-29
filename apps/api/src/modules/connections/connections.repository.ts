import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';

export type ConnectionRow = {
  id: string;
  owner_id: string;
  provider: 'google' | 'microsoft';
  external_account_id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export interface CreateConnectionInput {
  ownerId: string;
  orgId: string;
  provider: 'google' | 'microsoft';
  externalAccountId: string;
  name: string;
  encryptedTokenPayload: string;
  encryptedTokenIv: string;
  encryptedTokenTag: string;
  encryptedTokenKeyVersion: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: Date;
  scope: string | null;
  tokenType: string;
}

export interface ConnectionsRepository {
  listConnectionsForOwner(ownerId: string): Promise<ConnectionRow[]>;
  createConnection(input: CreateConnectionInput): Promise<ConnectionRow>;
  deleteConnectionByOwner(connectionId: string, ownerId: string): Promise<string | null>;
}

export function createConnectionsRepository(db: Kysely<Database>): ConnectionsRepository {
  return {
    async listConnectionsForOwner(ownerId: string): Promise<ConnectionRow[]> {
      return db
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
        .where('owner_id', '=', ownerId)
        .execute();
    },

    async createConnection(input: CreateConnectionInput): Promise<ConnectionRow> {
      return db
        .insertInto('provider_connections')
        .values({
          owner_id: input.ownerId,
          org_id: input.orgId,
          provider: input.provider,
          external_account_id: input.externalAccountId,
          name: input.name,
          encrypted_token_payload: input.encryptedTokenPayload,
          encrypted_token_iv: input.encryptedTokenIv,
          encrypted_token_tag: input.encryptedTokenTag,
          encrypted_token_key_version: input.encryptedTokenKeyVersion,
          access_token: input.accessToken,
          refresh_token: input.refreshToken,
          id_token: input.idToken,
          expires_at: input.expiresAt,
          scope: input.scope,
          token_type: input.tokenType,
        })
        .onConflict((oc) =>
          oc.columns(['provider', 'owner_id', 'external_account_id']).doUpdateSet({
            name: input.name,
            encrypted_token_payload: input.encryptedTokenPayload,
            encrypted_token_iv: input.encryptedTokenIv,
            encrypted_token_tag: input.encryptedTokenTag,
            encrypted_token_key_version: input.encryptedTokenKeyVersion,
            access_token: input.accessToken,
            refresh_token: input.refreshToken,
            id_token: input.idToken,
            expires_at: input.expiresAt,
            scope: input.scope,
            token_type: input.tokenType,
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
    },

    async deleteConnectionByOwner(
      connectionId: string,
      ownerId: string,
    ): Promise<string | null> {
      const existing = await db
        .deleteFrom('provider_connections')
        .where('id', '=', connectionId)
        .where('owner_id', '=', ownerId)
        .returning('id')
        .executeTakeFirst();

      return existing?.id ?? null;
    },
  };
}
