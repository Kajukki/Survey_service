import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import type { ProviderTokenSet } from '@survey-service/contracts';
import type {
  GoogleAuthStateStore,
  GoogleConnectionStore,
  LinkedGoogleConnection,
  PendingAuthState,
} from './google-auth.service';
import type { ProviderCredentialCrypto } from './credential-crypto';

interface GoogleAuthRepository {
  stateStore: GoogleAuthStateStore;
  connectionStore: GoogleConnectionStore;
}

function mapConnectionRow(row: {
  id: string;
  owner_id: string;
  external_account_id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
}): LinkedGoogleConnection {
  return {
    id: row.id,
    type: 'google',
    name: row.name,
    externalId: row.external_account_id,
    ownerId: row.owner_id,
    syncStatus: 'idle',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function createGoogleAuthRepository(
  db: Kysely<Database>,
  credentialCrypto: ProviderCredentialCrypto,
): GoogleAuthRepository {
  const stateStore: GoogleAuthStateStore = {
    async save(state: PendingAuthState): Promise<void> {
      await db
        .insertInto('provider_auth_states')
        .values({
          state: state.state,
          owner_id: state.userId,
          org_id: state.orgId,
          redirect_uri: state.redirectUri,
          code_challenge: state.codeChallenge,
          expires_at: state.expiresAt,
        })
        .execute();
    },

    async consume(state: string): Promise<PendingAuthState | null> {
      const row = await db
        .deleteFrom('provider_auth_states')
        .where('state', '=', state)
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        return null;
      }

      return {
        state: row.state,
        userId: row.owner_id,
        orgId: row.org_id,
        redirectUri: row.redirect_uri,
        codeChallenge: row.code_challenge,
        expiresAt: new Date(row.expires_at),
      };
    },
  };

  const connectionStore: GoogleConnectionStore = {
    async upsert(input: {
      ownerId: string;
      orgId: string;
      externalId: string;
      name: string;
      tokenSet: ProviderTokenSet;
      idToken: string;
    }): Promise<LinkedGoogleConnection> {
      const encryptedCredentials = credentialCrypto.encrypt({
        tokenSet: input.tokenSet,
        idToken: input.idToken,
      });

      const existing = await db
        .selectFrom('provider_connections')
        .selectAll()
        .where('provider', '=', 'google')
        .where('owner_id', '=', input.ownerId)
        .where('external_account_id', '=', input.externalId)
        .executeTakeFirst();

      if (existing) {
        const updated = await db
          .updateTable('provider_connections')
          .set({
            name: input.name,
            encrypted_token_payload: encryptedCredentials.encryptedTokenPayload,
            encrypted_token_iv: encryptedCredentials.encryptedTokenIv,
            encrypted_token_tag: encryptedCredentials.encryptedTokenTag,
            encrypted_token_key_version: encryptedCredentials.encryptedTokenKeyVersion,
            access_token: null,
            refresh_token: null,
            expires_at: input.tokenSet.expiresAt,
            scope: input.tokenSet.scope ?? null,
            token_type: input.tokenSet.tokenType,
            id_token: null,
            updated_at: new Date(),
          })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();

        return mapConnectionRow(updated);
      }

      const created = await db
        .insertInto('provider_connections')
        .values({
          owner_id: input.ownerId,
          org_id: input.orgId,
          provider: 'google',
          external_account_id: input.externalId,
          name: input.name,
          encrypted_token_payload: encryptedCredentials.encryptedTokenPayload,
          encrypted_token_iv: encryptedCredentials.encryptedTokenIv,
          encrypted_token_tag: encryptedCredentials.encryptedTokenTag,
          encrypted_token_key_version: encryptedCredentials.encryptedTokenKeyVersion,
          access_token: null,
          refresh_token: null,
          expires_at: input.tokenSet.expiresAt,
          scope: input.tokenSet.scope ?? null,
          token_type: input.tokenSet.tokenType,
          id_token: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapConnectionRow(created);
    },
  };

  return {
    stateStore,
    connectionStore,
  };
}
