// apps/api/src/modules/connections/connections.mock.ts
import { Connection } from '@survey-service/contracts';
import { randomUUID } from 'crypto';

export const mockConnections: Connection[] = [
  {
    id: randomUUID(),
    type: 'google',
    name: 'My Custom Google Workspace',
    externalId: 'google-external-123',
    credentialToken: 'mock-token',
    ownerId: 'mock-user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    syncStatus: 'idle',
  },
  {
    id: randomUUID(),
    type: 'microsoft',
    name: 'My Custom MS Tenant',
    externalId: 'ms-external-456',
    credentialToken: 'mock-token',
    ownerId: 'mock-user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    syncStatus: 'syncing',
  },
];
