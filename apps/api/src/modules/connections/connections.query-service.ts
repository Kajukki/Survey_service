import type { ConnectionRow } from './connections.repository';

export type ConnectionSummary = {
  id: string;
  type: 'google' | 'microsoft';
  name: string;
  externalId: string;
  ownerId: string;
  syncStatus: 'idle';
  createdAt: Date;
  updatedAt: Date;
};

export function mapConnectionRow(row: ConnectionRow): ConnectionSummary {
  return {
    id: row.id,
    type: row.provider,
    name: row.name,
    externalId: row.external_account_id,
    ownerId: row.owner_id,
    syncStatus: 'idle',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
