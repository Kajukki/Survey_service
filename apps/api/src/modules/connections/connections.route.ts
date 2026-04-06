import { FastifyInstance } from 'fastify';
import { CreateConnectionSchema } from '@survey-service/contracts';
import { mockConnections } from './connections.mock.js';
import { getPrincipal } from '../../server/principal';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';

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

export async function connectionsRoutes(app: FastifyInstance, deps?: { db?: Kysely<Database> }) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();

  // GET /connections
  zApp.get('/connections', async (request, reply) => {
    const principal = getPrincipal(request);

    const connections = deps?.db
      ? (
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
        ).map((row) => mapDbConnection(row as DbConnectionRow))
      : mockConnections.filter((connection) => connection.ownerId === principal.userId);

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
      // Fake create from validated payload
      const payload = request.body as Record<string, unknown>;
      return reply.status(201).send({
        success: true,
        data: {
          ...mockConnections[0],
          ownerId: principal.userId,
          ...payload,
        },
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

    const existing = mockConnections.find(
      (connection) => connection.id === id && connection.ownerId === principal.userId,
    );

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
