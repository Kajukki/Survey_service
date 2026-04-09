import { Pool } from 'pg';

export interface ProviderConnectionRow {
  id: string;
  owner_id: string;
  provider: 'google' | 'microsoft';
  encrypted_token_payload: string | null;
  encrypted_token_iv: string | null;
  encrypted_token_tag: string | null;
  encrypted_token_key_version: string | null;
  expires_at: Date | string;
  scope: string | null;
  token_type: string;
}

export interface PersistRefreshedTokenInput {
  connectionId: string;
  encryptedTokenPayload: string;
  encryptedTokenIv: string;
  encryptedTokenTag: string;
  encryptedTokenKeyVersion: string;
  expiresAt: string;
  scope: string | null;
  tokenType: string;
}

export async function loadProviderConnection(
  pool: Pool,
  connectionId: string,
  ownerId: string,
): Promise<ProviderConnectionRow | null> {
  const result = await pool.query<ProviderConnectionRow>(
    `
      SELECT
        id,
        owner_id,
        provider,
        encrypted_token_payload,
        encrypted_token_iv,
        encrypted_token_tag,
        encrypted_token_key_version,
        expires_at,
        scope,
        token_type
      FROM provider_connections
      WHERE id = $1 AND owner_id = $2
      LIMIT 1
    `,
    [connectionId, ownerId],
  );

  return result.rows[0] ?? null;
}

export async function persistRefreshedProviderToken(
  pool: Pool,
  input: PersistRefreshedTokenInput,
): Promise<void> {
  await pool.query(
    `
      UPDATE provider_connections
      SET
        encrypted_token_payload = $2,
        encrypted_token_iv = $3,
        encrypted_token_tag = $4,
        encrypted_token_key_version = $5,
        expires_at = $6,
        scope = $7,
        token_type = $8,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      input.connectionId,
      input.encryptedTokenPayload,
      input.encryptedTokenIv,
      input.encryptedTokenTag,
      input.encryptedTokenKeyVersion,
      input.expiresAt,
      input.scope,
      input.tokenType,
    ],
  );
}
