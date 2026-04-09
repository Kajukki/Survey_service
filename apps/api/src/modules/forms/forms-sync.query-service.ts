import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { mockForms } from './forms.mock.js';

export interface SyncTargetForm {
  id: string;
  connectionId: string;
  ownerId: string;
}

export async function resolveOwnedFormForSync(
  db: Kysely<Database> | undefined,
  formId: string,
  userId: string,
): Promise<SyncTargetForm | null> {
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
}
