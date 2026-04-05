// apps/api/src/modules/forms/forms.mock.ts
import { Form } from '@survey-service/contracts';
import { randomUUID } from 'crypto';
import { mockConnections } from '../connections/connections.mock.js';

export const mockForms: Form[] = [
  {
    id: randomUUID(),
    ownerId: 'mock-user-1',
    connectionId: mockConnections[0]!.id,
    externalFormId: 'form-ext-abc',
    title: 'Customer Satisfaction Survey 2026',
    description: 'Quarterly survey',
    responseCount: 154,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    ownerId: 'mock-user-1',
    connectionId: mockConnections[1]!.id,
    externalFormId: 'form-ext-xyz',
    title: 'Employee Engagement Feedback',
    responseCount: 42,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    ownerId: 'mock-user-2', // different owner to test sharing/filtering
    connectionId: randomUUID(),
    externalFormId: 'form-ext-pqr',
    title: 'Marketing Campaign Leads',
    responseCount: 1500,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];
