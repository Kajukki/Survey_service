import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import type { RabbitMQClient } from '../../infra/rabbitmq';
import { mockForms } from './forms.mock.js';
import { getPrincipal } from '../../server/principal';
import { createJobsRepository } from '../jobs/jobs.repository';
import { createJobsService } from '../jobs/jobs.service';

import { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function formsRoutes(
  app: FastifyInstance,
  deps?: {
    db?: Kysely<Database>;
    rabbitmq: RabbitMQClient;
  },
) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  const jobsService = deps?.db
    ? createJobsService({
        repository: createJobsRepository(deps.db),
        publishSyncJob: deps.rabbitmq.publishSyncJob,
      })
    : null;

  // GET /forms
  zApp.get('/forms', async (request, reply) => {
    const principal = getPrincipal(request);
    const forms = deps?.db
      ? (
          await deps.db
            .selectFrom('forms')
            .select([
              'id',
              'owner_id',
              'connection_id',
              'external_form_id',
              'title',
              'description',
              'response_count',
              'created_at',
              'updated_at',
            ])
            .where('owner_id', '=', principal.userId)
            .orderBy('updated_at', 'desc')
            .execute()
        ).map((row) => ({
          id: row.id,
          ownerId: row.owner_id,
          connectionId: row.connection_id,
          externalFormId: row.external_form_id,
          title: row.title,
          description: row.description ?? undefined,
          responseCount: row.response_count,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        }))
      : mockForms.filter((form) => form.ownerId === principal.userId);

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
    const resolvedForm = deps?.db
      ? await deps.db
          .selectFrom('forms')
          .select([
            'id',
            'owner_id',
            'connection_id',
            'external_form_id',
            'title',
            'description',
            'response_count',
            'created_at',
            'updated_at',
          ])
          .where('id', '=', id)
          .where('owner_id', '=', principal.userId)
          .executeTakeFirst()
          .then((form) =>
            form
              ? {
                  id: form.id,
                  ownerId: form.owner_id,
                  connectionId: form.connection_id,
                  externalFormId: form.external_form_id,
                  title: form.title,
                  description: form.description ?? undefined,
                  responseCount: form.response_count,
                  createdAt: new Date(form.created_at),
                  updatedAt: new Date(form.updated_at),
                }
              : null,
          )
      : mockForms.find((f) => f.id === id && f.ownerId === principal.userId);

    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    return reply.send({ success: true, data: resolvedForm, meta: { requestId: request.id } });
  });

  // POST /forms/:id/sync
  zApp.post('/forms/:id/sync', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    const mockForm = mockForms.find((item) => item.id === id && item.ownerId === principal.userId);
    const form = deps?.db
      ? await deps.db
          .selectFrom('forms')
          .select(['id', 'connection_id', 'owner_id'])
          .where('id', '=', id)
          .where('owner_id', '=', principal.userId)
          .executeTakeFirst()
      : mockForm
        ? {
            id,
            connection_id: mockForm.connectionId,
            owner_id: principal.userId,
          }
        : null;

    if (!form) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    if (!jobsService) {
      return reply.status(202).send({
        success: true,
        data: {
          job_id: `job-mock-${form.id}`,
          status: 'queued',
          type: 'sync_form',
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const job = await jobsService.enqueueSyncJob({
      requestedBy: principal.userId,
      connectionId: form.connection_id,
      formId: form.id,
      trigger: 'manual',
      forceFullSync: false,
    });

    return reply.status(202).send({
      success: true,
      data: {
        job_id: job.id,
        status: job.status,
        type: 'sync_form',
      },
      meta: {
        requestId: request.id,
      },
    });
  });
}
