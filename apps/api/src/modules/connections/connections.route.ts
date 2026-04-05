import { FastifyInstance } from 'fastify';
import { CreateConnectionSchema } from '@survey-service/contracts';
import { mockConnections } from './connections.mock.js';

import { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function connectionsRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();

  // GET /connections
  zApp.get('/connections', async (request, reply) => {
    // In a real app we'd get ownerId from JWT.
    // For now we mock owner filter manually.
    const connections = mockConnections;
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
      // Fake create from validated payload
      const payload = request.body as Record<string, unknown>;
      return reply.status(201).send({
        success: true,
        data: {
          ...mockConnections[0],
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

    return reply.status(204).send();
  });
}
