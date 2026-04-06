import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import type { RabbitMQClient } from '../../infra/rabbitmq';
import { mockForms } from './forms.mock.js';
import { getPrincipal } from '../../server/principal';

import { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function formsRoutes(
  app: FastifyInstance,
  _deps?: {
    db: Kysely<Database>;
    rabbitmq: RabbitMQClient;
  },
) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();

  // GET /forms
  zApp.get('/forms', async (request, reply) => {
    const principal = getPrincipal(request);
    const forms = mockForms.filter((form) => form.ownerId === principal.userId);

    // Basic mock pagination envelope
    return reply.send({
      success: true,
      data: forms,
      meta: {
        requestId: request.id,
        pagination: { page: 1, perPage: 20, total: forms.length, totalPages: 1 },
      },
    });
  });

  // GET /forms/:id
  zApp.get('/forms/:id', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    const form = mockForms.find((f) => f.id === id && f.ownerId === principal.userId);

    if (!form) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    return reply.send({ success: true, data: form, meta: { requestId: request.id } });
  });

  // POST /forms/:id/sync
  zApp.post('/forms/:id/sync', async (request, reply) => {
    getPrincipal(request);
    const { id } = request.params as { id: string };
    // This is where RabbitMQ enqueueing happens in real app
    return reply.status(202).send({
      success: true,
      data: {
        job_id: `job-mock-${id}`,
        status: 'queued',
        type: 'sync_form',
      },
      meta: {
        requestId: request.id,
      },
    });
  });
}
