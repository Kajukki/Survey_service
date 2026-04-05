import { FastifyInstance } from 'fastify';
import { mockForms } from './forms.mock.js';

import { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function formsRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();

  // GET /forms
  zApp.get('/forms', async (request, reply) => {
    // Basic mock pagination envelope
    return reply.send({
      success: true,
      data: mockForms,
      meta: {
        requestId: request.id,
        pagination: { page: 1, perPage: 20, total: mockForms.length, totalPages: 1 },
      },
    });
  });

  // GET /forms/:id
  zApp.get('/forms/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const form = mockForms.find((f) => f.id === id);

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
