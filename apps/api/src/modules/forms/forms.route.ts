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

  async function resolveAccessibleForm(id: string, userId: string) {
    if (!db) {
      return mockForms.find((form) => form.id === id && form.ownerId === userId) ?? null;
    }

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
      .where('owner_id', '=', userId)
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
      .where('form_shares.grantee_user_id', '=', userId)
      .executeTakeFirst();

    return sharedForm ? mapFormRow(sharedForm) : null;
  }

  function parsePositiveInt(value: unknown, fallback: number): number {
    if (typeof value !== 'string') {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  function parseDateParam(value: unknown): Date | null {
    if (typeof value !== 'string') {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function buildMockResponses(formId: string, total: number) {
    const boundedTotal = Math.max(0, Math.min(total, 600));
    const now = Date.now();

    return Array.from({ length: boundedTotal }, (_, index) => {
      const ordinal = index + 1;
      const completion = ordinal % 4 === 0 ? 'partial' : 'completed';
      const submittedAt = new Date(now - ordinal * 6 * 60 * 60 * 1000).toISOString();
      const score = ((ordinal % 5) + 1).toString();
      const channel = ['Organic', 'Referral', 'Paid', 'Social'][ordinal % 4]!;
      const comment = `Response ${ordinal} for ${formId.slice(0, 8)}`;

      return {
        id: `${formId}-resp-${ordinal.toString().padStart(4, '0')}`,
        submittedAt,
        completion,
        answerPreview: [
          {
            questionId: 'q-overall',
            questionLabel: 'Overall satisfaction',
            valuePreview: `${score}/5`,
          },
          {
            questionId: 'q-channel',
            questionLabel: 'Acquisition channel',
            valuePreview: channel,
          },
          {
            questionId: 'q-comment',
            questionLabel: 'Additional comments',
            valuePreview: comment,
          },
        ],
      };
    });
  }

  type AnalyticsGranularity = 'day' | 'week' | 'month';

  function parseAnalyticsGranularity(value: unknown): AnalyticsGranularity {
    return value === 'week' || value === 'month' ? value : 'day';
  }

  function formatDateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  function normalizeUtcDay(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  function addGranularityStep(value: Date, granularity: AnalyticsGranularity): Date {
    const next = new Date(value);
    if (granularity === 'day') {
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }

    if (granularity === 'week') {
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }

    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }

  function buildAnalyticsSeries(
    responses: Array<{ submittedAt?: string }>,
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ) {
    const buckets: Array<{ date: string; count: number; start: Date }> = [];
    let cursor = normalizeUtcDay(from);
    const end = normalizeUtcDay(to);

    while (cursor <= end) {
      buckets.push({ date: formatDateKey(cursor), count: 0, start: new Date(cursor) });
      cursor = addGranularityStep(cursor, granularity);
    }

    for (const response of responses) {
      if (!response.submittedAt) {
        continue;
      }

      const submittedAt = new Date(response.submittedAt);
      for (let index = buckets.length - 1; index >= 0; index -= 1) {
        const bucket = buckets[index]!;
        const nextStart = addGranularityStep(bucket.start, granularity);
        if (submittedAt >= bucket.start && submittedAt < nextStart) {
          bucket.count += 1;
          break;
        }
      }
    }

    return buckets.map(({ date, count }) => ({ date, count }));
  }

  function buildQuestionBreakdowns(
    responses: Array<{
      answerPreview: Array<{ questionId: string; questionLabel: string; valuePreview: string }>;
    }>,
    questionId?: string,
  ) {
    const scoreDistribution = new Map<string, number>();
    const channelDistribution = new Map<string, number>();
    let commentCount = 0;

    for (const response of responses) {
      const score = response.answerPreview.find((item) => item.questionId === 'q-overall');
      if (score) {
        scoreDistribution.set(score.valuePreview, (scoreDistribution.get(score.valuePreview) ?? 0) + 1);
      }

      const channel = response.answerPreview.find((item) => item.questionId === 'q-channel');
      if (channel) {
        channelDistribution.set(channel.valuePreview, (channelDistribution.get(channel.valuePreview) ?? 0) + 1);
      }

      const comment = response.answerPreview.find((item) => item.questionId === 'q-comment');
      if (comment && comment.valuePreview.trim().length > 0) {
        commentCount += 1;
      }
    }

    const breakdowns = [
      {
        questionId: 'q-overall',
        questionLabel: 'Overall satisfaction',
        questionType: 'rating' as const,
        responses: responses.length,
        distribution: [...scoreDistribution.entries()].map(([label, value]) => ({ label, value })),
      },
      {
        questionId: 'q-channel',
        questionLabel: 'Acquisition channel',
        questionType: 'single_choice' as const,
        responses: responses.length,
        distribution: [...channelDistribution.entries()].map(([label, value]) => ({ label, value })),
      },
      {
        questionId: 'q-comment',
        questionLabel: 'Additional comments',
        questionType: 'text' as const,
        responses: commentCount,
      },
    ];

    if (!questionId) {
      return breakdowns;
    }

    return breakdowns.filter((item) => item.questionId === questionId);
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
    const resolvedForm = await resolveAccessibleForm(id, principal.userId);

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
    const resolvedForm = await resolveAccessibleForm(id, principal.userId);

    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

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
        sections: [],
        questionCount: 0,
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

    const resolvedForm = await resolveAccessibleForm(id, principal.userId);
    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    const page = parsePositiveInt(query.page, 1);
    const perPage = Math.min(parsePositiveInt(query.perPage, 20), 100);
    const from = parseDateParam(query.from);
    const to = parseDateParam(query.to);
    const questionId = typeof query.questionId === 'string' ? query.questionId : undefined;
    const answerContains =
      typeof query.answerContains === 'string' && query.answerContains.trim().length > 0
        ? query.answerContains.trim().toLowerCase()
        : undefined;
    const completion =
      query.completion === 'completed' || query.completion === 'partial' ? query.completion : undefined;

    const allResponses = buildMockResponses(id, resolvedForm.responseCount);
    const filteredResponses = allResponses.filter((response) => {
      if (completion && response.completion !== completion) {
        return false;
      }

      if (from || to) {
        const submittedAt = response.submittedAt ? new Date(response.submittedAt).getTime() : null;
        if (submittedAt !== null) {
          if (from && submittedAt < from.getTime()) {
            return false;
          }
          if (to && submittedAt > to.getTime()) {
            return false;
          }
        }
      }

      if (questionId && !response.answerPreview.some((preview) => preview.questionId === questionId)) {
        return false;
      }

      if (
        answerContains &&
        !response.answerPreview.some((preview) => preview.valuePreview.toLowerCase().includes(answerContains))
      ) {
        return false;
      }

      return true;
    });

    const total = filteredResponses.length;
    const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;
    const pageOffset = (page - 1) * perPage;
    const pagedResponses = filteredResponses.slice(pageOffset, pageOffset + perPage);

    return reply.send({
      success: true,
      data: {
        responses: pagedResponses,
        appliedFilters: {
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
          ...(questionId ? { questionId } : {}),
          ...(answerContains ? { answerContains: query.answerContains } : {}),
          ...(completion ? { completion } : {}),
        },
      },
      meta: {
        requestId: request.id,
        pagination: {
          page,
          perPage,
          total,
          totalPages,
        },
      },
    });
  });

  // GET /forms/:id/analytics/overview
  zApp.get('/forms/:id/analytics/overview', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string | undefined>;

    const resolvedForm = await resolveAccessibleForm(id, principal.userId);
    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    const now = new Date();
    const defaultTo = normalizeUtcDay(now);
    const defaultFrom = new Date(defaultTo);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const from = parseDateParam(query.from) ?? defaultFrom;
    const to = parseDateParam(query.to) ?? defaultTo;
    const granularity = parseAnalyticsGranularity(query.granularity);
    const questionId = typeof query.questionId === 'string' ? query.questionId : undefined;

    const allResponses = buildMockResponses(id, resolvedForm.responseCount);
    const filteredResponses = allResponses.filter((response) => {
      if (!response.submittedAt) {
        return false;
      }

      const submittedAt = new Date(response.submittedAt).getTime();
      return submittedAt >= from.getTime() && submittedAt <= to.getTime();
    });

    const completedResponses = filteredResponses.filter((response) => response.completion === 'completed').length;
    const completionRate = filteredResponses.length > 0 ? Math.round((completedResponses / filteredResponses.length) * 100) : 0;

    const scoreValues = filteredResponses
      .map((response) => response.answerPreview.find((item) => item.questionId === 'q-overall')?.valuePreview)
      .filter((value): value is string => Boolean(value))
      .map((value) => Number.parseInt(value.split('/')[0] ?? '', 10))
      .filter((value) => Number.isFinite(value));

    const averageScore =
      scoreValues.length > 0
        ? (scoreValues.reduce((total, value) => total + value, 0) / scoreValues.length).toFixed(1)
        : '0.0';

    return reply.send({
      success: true,
      data: {
        kpis: [
          {
            label: 'Responses in range',
            value: String(filteredResponses.length),
            delta: `${resolvedForm.responseCount} total`,
          },
          {
            label: 'Completion rate',
            value: `${completionRate}%`,
            delta: `${completedResponses} completed`,
          },
          {
            label: 'Avg satisfaction',
            value: averageScore,
            delta: 'Scale: 1 to 5',
          },
        ],
        series: buildAnalyticsSeries(filteredResponses, from, to, granularity),
        appliedFilters: {
          from: from.toISOString(),
          to: to.toISOString(),
          granularity,
          ...(questionId ? { questionId } : {}),
        },
        dataFreshness: {
          generatedAt: new Date().toISOString(),
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

    const resolvedForm = await resolveAccessibleForm(id, principal.userId);
    if (!resolvedForm) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    const now = new Date();
    const defaultTo = normalizeUtcDay(now);
    const defaultFrom = new Date(defaultTo);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const from = parseDateParam(query.from) ?? defaultFrom;
    const to = parseDateParam(query.to) ?? defaultTo;
    const granularity = parseAnalyticsGranularity(query.granularity);
    const questionId = typeof query.questionId === 'string' ? query.questionId : undefined;

    const allResponses = buildMockResponses(id, resolvedForm.responseCount);
    const filteredResponses = allResponses.filter((response) => {
      if (!response.submittedAt) {
        return false;
      }

      const submittedAt = new Date(response.submittedAt).getTime();
      return submittedAt >= from.getTime() && submittedAt <= to.getTime();
    });

    return reply.send({
      success: true,
      data: {
        questions: buildQuestionBreakdowns(filteredResponses, questionId),
        appliedFilters: {
          from: from.toISOString(),
          to: to.toISOString(),
          granularity,
          ...(questionId ? { questionId } : {}),
        },
        dataFreshness: {
          generatedAt: new Date().toISOString(),
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
