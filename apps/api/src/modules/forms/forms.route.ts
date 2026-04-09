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
  const db = deps?.db;

  function mapFormRow(row: {
    id: string;
    owner_id: string;
    connection_id: string;
    external_form_id: string;
    title: string;
    description: string | null;
    response_count: number;
    created_at: Date | string;
    updated_at: Date | string;
  }) {
    return {
      id: row.id,
      ownerId: row.owner_id,
      connectionId: row.connection_id,
      externalFormId: row.external_form_id,
      title: row.title,
      description: row.description ?? undefined,
      responseCount: row.response_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  const jobsService = deps?.db
    ? createJobsService({
        repository: createJobsRepository(deps.db),
        publishSyncJob: deps.rabbitmq.publishSyncJob,
      })
    : null;

  // GET /forms
  zApp.get('/forms', async (request, reply) => {
    const principal = getPrincipal(request);
    const forms = db
      ? await (async () => {
          const [ownedForms, sharedForms] = await Promise.all([
            db
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
            .execute(),
            db
              .selectFrom('forms')
              .innerJoin('form_shares', 'form_shares.form_id', 'forms.id')
              .select([
                'forms.id as id',
                'forms.owner_id as owner_id',
                'forms.connection_id as connection_id',
                'forms.external_form_id as external_form_id',
                'forms.title as title',
                'forms.description as description',
                'forms.response_count as response_count',
                'forms.created_at as created_at',
                'forms.updated_at as updated_at',
              ])
              .where('form_shares.grantee_user_id', '=', principal.userId)
              .execute(),
          ]);

          const dedupedForms = new Map<string, (typeof ownedForms)[number]>();
          for (const row of [...ownedForms, ...sharedForms]) {
            dedupedForms.set(row.id, row);
          }

          return [...dedupedForms.values()]
            .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
            .map(mapFormRow);
        })()
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
    const resolvedForm = db
      ? await (async () => {
          const ownedForm = await db
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
            .executeTakeFirst();

          if (ownedForm) {
            return mapFormRow(ownedForm);
          }

          const sharedForm = await db
            .selectFrom('forms')
            .innerJoin('form_shares', 'form_shares.form_id', 'forms.id')
            .select([
              'forms.id as id',
              'forms.owner_id as owner_id',
              'forms.connection_id as connection_id',
              'forms.external_form_id as external_form_id',
              'forms.title as title',
              'forms.description as description',
              'forms.response_count as response_count',
              'forms.created_at as created_at',
              'forms.updated_at as updated_at',
            ])
            .where('forms.id', '=', id)
            .where('form_shares.grantee_user_id', '=', principal.userId)
            .executeTakeFirst();

          return sharedForm ? mapFormRow(sharedForm) : null;
        })()
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
    const form = db
      ? await db
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
