import { FastifyInstance } from 'fastify';
import { CreateExportSchema } from '@survey-service/contracts';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { getPrincipal } from '../../server/principal';

const mockExports = [
  {
    id: 'export-mock-1',
    format: 'csv',
    status: 'ready',
    requested_at: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 'export-mock-2',
    format: 'excel',
    status: 'queued',
    requested_at: new Date().toISOString(),
  },
];

export async function exportsRoutes(app: FastifyInstance, deps?: { db?: Kysely<Database> }) {
  // GET /exports
  app.get('/exports', async (request, reply) => {
    const principal = getPrincipal(request);
    const exportsList = deps?.db
      ? (
            await deps.db
              .selectFrom('export_jobs')
              .select(['id', 'format', 'status', 'requested_at'])
              .where('requested_by', '=', principal.userId)
              .orderBy('requested_at', 'desc')
              .execute()
          ).map((item) => ({
            id: item.id,
            format: item.format,
            status: item.status,
            requested_at: new Date(item.requested_at).toISOString(),
          }))
      : mockExports;

    return reply.send({
      success: true,
      data: exportsList,
      meta: {
        requestId: request.id,
        pagination: { page: 1, perPage: 20, total: exportsList.length, totalPages: 1 },
      },
    });
  });

  // POST /exports
  app.post('/exports', async (request, reply) => {
    const principal = getPrincipal(request);
    const bodyResult = CreateExportSchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Invalid export payload',
          details: {
            issues: bodyResult.error.issues,
          },
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const db = deps?.db;
    if (db) {
      const ownedForm = await db
        .selectFrom('forms')
        .select('id')
        .where('id', '=', bodyResult.data.formId)
        .where('owner_id', '=', principal.userId)
        .executeTakeFirst();

      if (!ownedForm) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'not_found',
            message: 'Form not found',
          },
          meta: {
            requestId: request.id,
          },
        });
      }

      const exportJob = await db
        .insertInto('export_jobs')
        .values({
          requested_by: principal.userId,
          form_id: bodyResult.data.formId,
          format: bodyResult.data.format,
          status: 'queued',
          download_url: null,
          error: null,
          completed_at: null,
        })
        .returning(['id', 'format', 'status', 'requested_at'])
        .executeTakeFirstOrThrow();

      return reply.status(202).send({
        success: true,
        data: {
          id: exportJob.id,
          format: exportJob.format,
          status: exportJob.status,
          requested_at: new Date(exportJob.requested_at).toISOString(),
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const exportJob = {
      id: `export-job-${Date.now()}`,
      format: bodyResult.data.format,
      status: 'queued',
      requested_at: new Date().toISOString(),
    };
    mockExports.unshift(exportJob);

    return reply.status(202).send({
      success: true,
      data: exportJob,
      meta: {
        requestId: request.id,
      },
    });
  });
}
