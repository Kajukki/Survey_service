import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { Database } from '@survey-service/db';
import type { Metrics } from '../../infra/metrics';
import { getPrincipal } from '../../server/principal';
import { createJobsRepository } from '../jobs/jobs.repository';
import { createJobsCommandService } from '../jobs/jobs.command-service';
import { createJobsSyncTargetQueryService } from '../jobs/jobs-sync-target.query-service';
import { createFormsAnalyticsQueryService } from './forms-analytics.query-service';
import { createFormsRepository } from './forms.repository';
import { createFormsQueryService } from './forms.query-service';

import { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function formsRoutes(
  app: FastifyInstance,
  deps: { db: Kysely<Database>; logger?: Logger; metrics?: Metrics },
) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  const db = deps.db;
  const formsRepository = createFormsRepository(db);
  const formsQueryService = createFormsQueryService({
    repository: formsRepository,
  });
  const formsAnalyticsQueryService = createFormsAnalyticsQueryService({
    db,
    loadFormResponses: (formId: string, _fallbackCount: number) =>
      formsQueryService.loadFormResponses(formId),
    loadFormStructure: formsQueryService.loadFormStructure,
  });
  const jobsCommandService = createJobsCommandService({
    repository: createJobsRepository(db),
    syncTargetQuery: createJobsSyncTargetQueryService(db),
    logger: deps?.logger,
    metrics: deps?.metrics,
  });

  // GET /forms
  zApp.get('/forms', async (request, reply) => {
    const principal = getPrincipal(request);
    const forms = await formsQueryService.listAccessibleForms(principal.userId);

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
    const resolvedForm = await formsQueryService.getAccessibleForm(id, principal.userId);

    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    return reply.send({ success: true, data: resolvedForm, meta: { requestId: request.id } });
  });

  // GET /forms/:id/structure
  zApp.get('/forms/:id/structure', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    const resolvedForm = await formsQueryService.getAccessibleForm(id, principal.userId);

    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    const formStructure = await formsQueryService.loadFormStructure(id);

    return reply.send({
      success: true,
      data: {
        form: {
          id: resolvedForm.id,
          ownerId: resolvedForm.ownerId,
          title: resolvedForm.title,
          description: resolvedForm.description,
          responseCount: resolvedForm.responseCount,
          updatedAt: resolvedForm.updatedAt.toISOString(),
        },
        sections: formStructure.sections,
        questionCount: formStructure.questionCount,
      },
      meta: {
        requestId: request.id,
      },
    });
  });

  // GET /forms/:id/responses
  zApp.get('/forms/:id/responses', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string | undefined>;

    const resolvedForm = await formsQueryService.getAccessibleForm(id, principal.userId);
    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    const questionId = typeof query.questionId === 'string' ? query.questionId : undefined;
    const responsesResult = await formsQueryService.getFormResponses({
      formId: id,
      fallbackResponseCount: resolvedForm.responseCount,
      pageInput: query.page,
      perPageInput: query.perPage,
      fromInput: query.from,
      toInput: query.to,
      questionId,
      answerContainsInput: query.answerContains,
      completionInput: query.completion,
    });

    return reply.send({
      success: true,
      data: {
        responses: responsesResult.responses,
        appliedFilters: responsesResult.appliedFilters,
      },
      meta: {
        requestId: request.id,
        pagination: responsesResult.pagination,
      },
    });
  });

  // GET /forms/:id/analytics
  zApp.get('/forms/:id/analytics', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };

    const resolvedForm = await formsQueryService.getAccessibleForm(id, principal.userId);
    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    const analytics = await formsAnalyticsQueryService.loadPersistedAnalyticsReport(
      id,
      resolvedForm.responseCount,
    );
    return reply.send({
      success: true,
      data: analytics,
      meta: {
        requestId: request.id,
      },
    });
  });

  // GET /forms/:id/analytics/overview
  zApp.get('/forms/:id/analytics/overview', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string | undefined>;

    const resolvedForm = await formsQueryService.getAccessibleForm(id, principal.userId);
    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    const questionId = typeof query.questionId === 'string' ? query.questionId : undefined;
    const overview = await formsAnalyticsQueryService.getOverview({
      formId: id,
      fallbackResponseCount: resolvedForm.responseCount,
      fromInput: query.from,
      toInput: query.to,
      granularityInput: query.granularity,
      ...(questionId ? { questionId } : {}),
    });

    return reply.send({
      success: true,
      data: {
        kpis: overview.kpis,
        series: overview.series,
        appliedFilters: overview.appliedFilters,
        dataFreshness: {
          generatedAt: overview.generatedAt,
          lastSuccessfulSyncAt: resolvedForm.updatedAt.toISOString(),
          lastAttemptedSyncAt: resolvedForm.updatedAt.toISOString(),
        },
      },
      meta: {
        requestId: request.id,
      },
    });
  });

  // GET /forms/:id/analytics/questions
  zApp.get('/forms/:id/analytics/questions', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string | undefined>;

    const resolvedForm = await formsQueryService.getAccessibleForm(id, principal.userId);
    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    const questionId = typeof query.questionId === 'string' ? query.questionId : undefined;
    const questionAnalytics = await formsAnalyticsQueryService.getQuestions({
      formId: id,
      fallbackResponseCount: resolvedForm.responseCount,
      fromInput: query.from,
      toInput: query.to,
      granularityInput: query.granularity,
      ...(questionId ? { questionId } : {}),
    });

    return reply.send({
      success: true,
      data: {
        questions: questionAnalytics.questions,
        appliedFilters: questionAnalytics.appliedFilters,
        dataFreshness: {
          generatedAt: questionAnalytics.generatedAt,
          lastSuccessfulSyncAt: resolvedForm.updatedAt.toISOString(),
          lastAttemptedSyncAt: resolvedForm.updatedAt.toISOString(),
        },
      },
      meta: {
        requestId: request.id,
      },
    });
  });

  // GET /forms/:id/analytics/segments
  zApp.get('/forms/:id/analytics/segments', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string | undefined>;

    const resolvedForm = await formsQueryService.getAccessibleForm(id, principal.userId);
    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    const questionId = typeof query.questionId === 'string' ? query.questionId : undefined;
    const segmentBy = query.segmentBy === 'channel' ? 'channel' : 'completion';
    const segmentAnalytics = await formsAnalyticsQueryService.getSegments({
      formId: id,
      fallbackResponseCount: resolvedForm.responseCount,
      fromInput: query.from,
      toInput: query.to,
      granularityInput: query.granularity,
      segmentBy,
      ...(questionId ? { questionId } : {}),
    });

    return reply.send({
      success: true,
      data: {
        segments: segmentAnalytics.segments,
        appliedFilters: segmentAnalytics.appliedFilters,
        dataFreshness: {
          generatedAt: segmentAnalytics.generatedAt,
          lastSuccessfulSyncAt: resolvedForm.updatedAt.toISOString(),
          lastAttemptedSyncAt: resolvedForm.updatedAt.toISOString(),
        },
      },
      meta: {
        requestId: request.id,
      },
    });
  });

  // POST /forms/:id/sync
  zApp.post('/forms/:id/sync', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    const job = await jobsCommandService.enqueueSyncJob({
      requestedBy: principal.userId,
      formId: id,
      trigger: 'manual',
      forceFullSync: false,
      requestId: request.id,
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
