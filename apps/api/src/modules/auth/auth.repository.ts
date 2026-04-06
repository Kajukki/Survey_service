import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';

export interface AuthUserRecord {
  id: string;
  username: string;
  passwordHash: string;
  orgId: string;
}

export interface AuthRefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenWithUser {
  token: AuthRefreshTokenRecord;
  user: AuthUserRecord;
}

export interface AuthRepository {
  findUserByUsername(username: string): Promise<AuthUserRecord | null>;
  createUser(input: {
    username: string;
    passwordHash: string;
    orgId: string;
  }): Promise<AuthUserRecord>;
  createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<AuthRefreshTokenRecord>;
  findActiveRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenWithUser | null>;
  revokeRefreshToken(id: string): Promise<void>;
}

export function createAuthRepository(db: Kysely<Database>): AuthRepository {
  return {
    async findUserByUsername(username) {
      const row = await db
        .selectFrom('users')
        .selectAll()
        .where('username', '=', username)
        .executeTakeFirst();

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        orgId: row.org_id,
      };
    },

    async createUser(input) {
      const row = await db
        .insertInto('users')
        .values({
          username: input.username,
          password_hash: input.passwordHash,
          org_id: input.orgId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        orgId: row.org_id,
      };
    },

    async createRefreshToken(input) {
      const row = await db
        .insertInto('auth_refresh_tokens')
        .values({
          user_id: input.userId,
          token_hash: input.tokenHash,
          expires_at: input.expiresAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: new Date(row.expires_at),
        revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      };
    },

    async findActiveRefreshTokenByHash(tokenHash) {
      const row = await db
        .selectFrom('auth_refresh_tokens')
        .innerJoin('users', 'users.id', 'auth_refresh_tokens.user_id')
        .select([
          'auth_refresh_tokens.id as token_id',
          'auth_refresh_tokens.user_id as token_user_id',
          'auth_refresh_tokens.token_hash as token_hash',
          'auth_refresh_tokens.expires_at as token_expires_at',
          'auth_refresh_tokens.revoked_at as token_revoked_at',
          'users.id as user_id',
          'users.username as user_username',
          'users.password_hash as user_password_hash',
          'users.org_id as user_org_id',
        ])
        .where('auth_refresh_tokens.token_hash', '=', tokenHash)
        .where('auth_refresh_tokens.revoked_at', 'is', null)
        .executeTakeFirst();

      if (!row) {
        return null;
      }

      const expiresAt = new Date(row.token_expires_at);
      if (expiresAt <= new Date()) {
        return null;
      }

      return {
        token: {
          id: row.token_id,
          userId: row.token_user_id,
          tokenHash: row.token_hash,
          expiresAt,
          revokedAt: row.token_revoked_at ? new Date(row.token_revoked_at) : null,
        },
        user: {
          id: row.user_id,
          username: row.user_username,
          passwordHash: row.user_password_hash,
          orgId: row.user_org_id,
        },
      };
    },

    async revokeRefreshToken(id) {
      await db
        .updateTable('auth_refresh_tokens')
        .set({
          revoked_at: new Date(),
        })
        .where('id', '=', id)
        .where('revoked_at', 'is', null)
        .execute();
    },
  };
}
