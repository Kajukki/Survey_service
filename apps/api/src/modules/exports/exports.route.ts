import { FastifyInstance } from 'fastify';
import { CreateExportSchema } from '@survey-service/contracts';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { getPrincipal } from '../../server/principal';

const ExportIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function exportsRoutes(app: FastifyInstance, deps: { db: Kysely<Database> }) {
  // GET /exports
  app.get('/exports', async (request, reply) => {
    const principal = getPrincipal(request);
    const exportsList = (
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
    }));

    return reply.send({
      success: true,
      data: exportsList,
      meta: {
        requestId: request.id,
        pagination: { page: 1, perPage: 20, total: exportsList.length, totalPages: 1 },
      },
    });
  });

  // GET /exports/:id
  app.get('/exports/:id', async (request, reply) => {
    const principal = getPrincipal(request);
    const paramsResult = ExportIdParamsSchema.safeParse(request.params ?? {});
    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Invalid export id',
          details: {
            issues: paramsResult.error.issues,
          },
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const exportJob = await deps.db
      .selectFrom('export_jobs')
      .select(['id', 'format', 'status', 'requested_at', 'download_url', 'error', 'completed_at'])
      .where('id', '=', paramsResult.data.id)
      .where('requested_by', '=', principal.userId)
      .executeTakeFirst();

    if (!exportJob) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'not_found',
          message: 'Export not found',
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        id: exportJob.id,
        format: exportJob.format,
        status: exportJob.status,
        requested_at: new Date(exportJob.requested_at).toISOString(),
        download_url: exportJob.download_url,
        error: exportJob.error,
        completed_at: exportJob.completed_at
          ? new Date(exportJob.completed_at).toISOString()
          : null,
      },
      meta: {
        requestId: request.id,
      },
    });
  });

  // GET /exports/:id/download
  app.get('/exports/:id/download', async (request, reply) => {
    const principal = getPrincipal(request);
    const paramsResult = ExportIdParamsSchema.safeParse(request.params ?? {});
    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Invalid export id',
          details: {
            issues: paramsResult.error.issues,
          },
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const exportJob = await deps.db
      .selectFrom('export_jobs')
      .select(['id', 'status', 'download_url'])
      .where('id', '=', paramsResult.data.id)
      .where('requested_by', '=', principal.userId)
      .executeTakeFirst();

    if (!exportJob) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'not_found',
          message: 'Export not found',
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    if (!exportJob.download_url || exportJob.status !== 'ready') {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'export_not_ready',
          message: 'Export is not ready for download',
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        id: exportJob.id,
        download_url: exportJob.download_url,
      },
      meta: {
        requestId: request.id,
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

    const ownedForm = await deps.db
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

    const exportJob = await deps.db
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
  });
}
