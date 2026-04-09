import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { mockConnections } from '../connections/connections.mock.js';
import { mockForms } from '../forms/forms.mock.js';

export interface SyncTargetForm {
  id: string;
  connectionId: string;
  ownerId: string;
}

export interface SyncTargetConnection {
  id: string;
  ownerId: string;
}

export interface JobsSyncTargetQueryService {
  resolveOwnedFormForSync(formId: string, userId: string): Promise<SyncTargetForm | null>;
  resolveOwnedConnectionForSync(
    connectionId: string,
    userId: string,
  ): Promise<SyncTargetConnection | null>;
}

export function createJobsSyncTargetQueryService(
  db: Kysely<Database> | undefined,
): JobsSyncTargetQueryService {
  return {
    async resolveOwnedFormForSync(formId: string, userId: string): Promise<SyncTargetForm | null> {
      if (!db) {
        const mockForm = mockForms.find((item) => item.id === formId && item.ownerId === userId);
        return mockForm
          ? {
              id: mockForm.id,
              connectionId: mockForm.connectionId,
              ownerId: mockForm.ownerId,
            }
          : null;
      }

      const form = await db
        .selectFrom('forms')
        .select(['id', 'connection_id', 'owner_id'])
        .where('id', '=', formId)
        .where('owner_id', '=', userId)
        .executeTakeFirst();

      if (!form) {
        return null;
      }

      return {
        id: form.id,
        connectionId: form.connection_id,
        ownerId: form.owner_id,
      };
    },

    async resolveOwnedConnectionForSync(
      connectionId: string,
      userId: string,
    ): Promise<SyncTargetConnection | null> {
      if (!db) {
        const mockConnection = mockConnections.find(
          (item) => item.id === connectionId && item.ownerId === userId,
        );
        return mockConnection
          ? {
              id: mockConnection.id,
              ownerId: mockConnection.ownerId,
            }
          : null;
      }

      const connection = await db
        .selectFrom('provider_connections')
        .select(['id', 'owner_id'])
        .where('id', '=', connectionId)
        .where('owner_id', '=', userId)
        .executeTakeFirst();

      if (!connection) {
        return null;
      }

      return {
        id: connection.id,
        ownerId: connection.owner_id,
      };
    },
  };
}
