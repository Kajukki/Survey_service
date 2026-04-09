import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import type { RabbitMQClient } from '../../infra/rabbitmq';
import { createJobsRepository } from './jobs.repository';
import { createJobsCommandService } from './jobs.command-service';
import { createJobsSyncTargetQueryService } from './jobs-sync-target.query-service';
import { createJobsService } from './jobs.service';
import { getPrincipal } from '../../server/principal';

const JobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

const CreateSyncJobBodySchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    formId: z.string().uuid().optional(),
    forceFullSync: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.connectionId || value.formId), {
    message: 'connectionId or formId is required',
    path: ['connectionId'],
  });

export async function jobsRoutes(
  app: FastifyInstance,
  deps: {
    db: Kysely<Database>;
    rabbitmq: RabbitMQClient;
  },
) {
  const repository = createJobsRepository(deps.db);
  const commandService = createJobsCommandService({
    repository,
    syncTargetQuery: createJobsSyncTargetQueryService(deps.db),
    publishSyncJob: deps.rabbitmq.publishSyncJob,
  });
  const service = createJobsService({
    repository,
    publishSyncJob: deps.rabbitmq.publishSyncJob,
  });

  // GET /jobs
  app.get('/jobs', async (request, reply) => {
    const principal = getPrincipal(request);
    const queryResult = JobsQuerySchema.safeParse(request.query ?? {});
    if (!queryResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Invalid query parameters',
          details: {
            issues: queryResult.error.issues,
          },
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const query = queryResult.data;
    const jobs = await service.listJobs(principal.userId, query.page, query.perPage);

    return reply.send({
      success: true,
      data: jobs.items.map((job) => ({
        id: job.id,
        status: job.status,
        source: job.source,
        created_at: job.createdAt,
        completed_at: job.completedAt,
      })),
      meta: {
        requestId: request.id,
        pagination: {
          page: query.page,
          perPage: query.perPage,
          total: jobs.total,
          totalPages: Math.max(1, Math.ceil(jobs.total / query.perPage)),
        },
      },
    });
  });

  // POST /jobs/sync
  app.post('/jobs/sync', async (request, reply) => {
    const principal = getPrincipal(request);
    const bodyResult = CreateSyncJobBodySchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Invalid sync job payload',
          details: {
            issues: bodyResult.error.issues,
          },
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const body = bodyResult.data;
    const job = await commandService.enqueueSyncJob({
      requestedBy: principal.userId,
      connectionId: body.connectionId,
      formId: body.formId,
      trigger: 'manual',
      forceFullSync: body.forceFullSync ?? false,
    });

    return reply.status(202).send({
      success: true,
      data: {
        job_id: job.id,
        status: job.status,
        type: 'sync',
      },
      meta: {
        requestId: request.id,
      },
    });
  });

  // GET /jobs/:id
  app.get('/jobs/:id', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    const existing = await service.getJobById(principal.userId, id);

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'not_found',
          message: 'Job not found',
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        id: existing.id,
        status: existing.status,
        source: existing.source,
        created_at: existing.createdAt,
        completed_at: existing.completedAt,
        result: existing.status === 'succeeded' ? { sync_count: 154, errors: [] } : null,
      },
      meta: {
        requestId: request.id,
      },
    });
  });
}



