import { FastifyInstance } from 'fastify';
import { CreateExportSchema } from '@survey-service/contracts';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { getPrincipal } from '../../server/principal';
import { createExportsRepository } from './exports.repository';
import { mapExportDetail, mapExportSummary } from './exports.query-service';

const ExportIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function exportsRoutes(app: FastifyInstance, deps: { db: Kysely<Database> }) {
  const repository = createExportsRepository(deps.db);
  // GET /exports
  app.get('/exports', async (request, reply) => {
    const principal = getPrincipal(request);
    const exportsList = (await repository.listExportsForOwner(principal.userId)).map(
      mapExportSummary,
    );

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

    const exportJob = await repository.getExportDetail(principal.userId, paramsResult.data.id);

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
      data: mapExportDetail(exportJob),
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

    const exportJob = await repository.getExportDownload(principal.userId, paramsResult.data.id);

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

    const ownsForm = await repository.isFormOwnedByUser(bodyResult.data.formId, principal.userId);
    if (!ownsForm) {
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

    const exportJob = await repository.createExportJob({
      requestedBy: principal.userId,
      formId: bodyResult.data.formId,
      format: bodyResult.data.format,
    });

    return reply.status(202).send({
      success: true,
      data: mapExportSummary(exportJob),
      meta: {
        requestId: request.id,
      },
    });
  });
}
