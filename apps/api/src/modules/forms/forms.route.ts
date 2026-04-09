import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import type { RabbitMQClient } from '../../infra/rabbitmq';
import { mockForms } from './forms.mock.js';
import { getPrincipal } from '../../server/principal';
import { createJobsRepository } from '../jobs/jobs.repository';
import { createJobsCommandService } from '../jobs/jobs.command-service';
import { resolveOwnedFormForSync } from './forms-sync.query-service';
import { createFormsAnalyticsQueryService } from './forms-analytics.query-service';

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
      const completion: 'completed' | 'partial' = ordinal % 4 === 0 ? 'partial' : 'completed';
      const submittedAt = new Date(now - ordinal * 6 * 60 * 60 * 1000).toISOString();
      const score = ((ordinal % 5) + 1).toString();
      const channel = ['Organic', 'Referral', 'Paid', 'Social'][ordinal % 4]!;
      const comment = `Response ${ordinal} for ${formId.slice(0, 8)}`;

      return {
        id: `${formId}-resp-${ordinal.toString().padStart(4, '0')}`,
        submittedAt,
        completion,
        answers: {
          'q-overall': score,
          'q-channel': channel,
          'q-comment': comment,
        },
        answerPreview: [
          {
            questionId: 'q-overall',
            questionLabel: 'Overall satisfaction',
            questionType: 'rating' as const,
            valuePreview: `${score}/5`,
          },
          {
            questionId: 'q-channel',
            questionLabel: 'Acquisition channel',
            questionType: 'single_choice' as const,
            valuePreview: channel,
          },
          {
            questionId: 'q-comment',
            questionLabel: 'Additional comments',
            questionType: 'text' as const,
            valuePreview: comment,
          },
        ],
      };
    });
  }

  type FormResponseRecord = {
    id: string;
    submittedAt?: string;
    completion: 'completed' | 'partial';
    answerPreview: Array<{
      questionId: string;
      questionLabel: string;
      questionType?: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
      valuePreview: string;
    }>;
    answers: Record<string, unknown>;
  };

  type PersistedFormStructureRecord = {
    sections: Array<{
      id: string;
      title: string;
      description?: string;
      order: number;
      questions: Array<{
        id: string;
        externalQuestionId?: string;
        sectionId?: string;
        label: string;
        description?: string;
        required?: boolean;
        type: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
        options?: Array<{ value: string; label: string }>;
        order: number;
      }>;
    }>;
    questionCount: number;
  };

  function normalizeAnswerPreviewJson(value: unknown): FormResponseRecord['answerPreview'] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const candidate = item as Record<string, unknown>;
        if (
          typeof candidate.questionId !== 'string' ||
          typeof candidate.questionLabel !== 'string' ||
          typeof candidate.valuePreview !== 'string'
        ) {
          return null;
        }

        return {
          questionId: candidate.questionId,
          questionLabel: candidate.questionLabel,
          ...(candidate.questionType === 'single_choice' ||
          candidate.questionType === 'multi_choice' ||
          candidate.questionType === 'text' ||
          candidate.questionType === 'rating' ||
          candidate.questionType === 'date' ||
          candidate.questionType === 'number'
            ? { questionType: candidate.questionType }
            : {}),
          valuePreview: candidate.valuePreview,
        };
      })
      .filter((item): item is FormResponseRecord['answerPreview'][number] => Boolean(item));
  }

  function normalizeAnswersJson(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  async function loadFormResponses(
    formId: string,
    fallbackCount: number,
  ): Promise<FormResponseRecord[]> {
    if (!db) {
      return buildMockResponses(formId, fallbackCount);
    }

    const rows = await db
      .selectFrom('form_responses')
      .select([
        'external_response_id',
        'submitted_at',
        'completion',
        'answer_preview_json',
        'answers_json',
      ])
      .where('form_id', '=', formId)
      .orderBy('submitted_at', 'desc')
      .execute();

    if (rows.length === 0) {
      return [];
    }

    return rows.map((row) => ({
      id: row.external_response_id,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : undefined,
      completion: row.completion,
      answerPreview: normalizeAnswerPreviewJson(row.answer_preview_json),
      answers: normalizeAnswersJson(row.answers_json),
    }));
  }

  function normalizePersistedFormStructureJson(
    value: unknown,
  ): PersistedFormStructureRecord | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as Record<string, unknown>;
    if (!Array.isArray(candidate.sections)) {
      return null;
    }

    const sections = candidate.sections
      .map((section): PersistedFormStructureRecord['sections'][number] | null => {
        if (!section || typeof section !== 'object') {
          return null;
        }

        const sectionCandidate = section as Record<string, unknown>;
        if (
          typeof sectionCandidate.id !== 'string' ||
          typeof sectionCandidate.title !== 'string' ||
          typeof sectionCandidate.order !== 'number' ||
          !Array.isArray(sectionCandidate.questions)
        ) {
          return null;
        }

        const questions = sectionCandidate.questions
          .map(
            (
              question,
            ): PersistedFormStructureRecord['sections'][number]['questions'][number] | null => {
              if (!question || typeof question !== 'object') {
                return null;
              }

              const questionCandidate = question as Record<string, unknown>;
              if (
                typeof questionCandidate.id !== 'string' ||
                typeof questionCandidate.label !== 'string' ||
                typeof questionCandidate.order !== 'number' ||
                !['single_choice', 'multi_choice', 'text', 'rating', 'date', 'number'].includes(
                  String(questionCandidate.type),
                )
              ) {
                return null;
              }

              const options = Array.isArray(questionCandidate.options)
                ? questionCandidate.options
                    .map((option) => {
                      if (!option || typeof option !== 'object') {
                        return null;
                      }

                      const optionCandidate = option as Record<string, unknown>;
                      if (
                        typeof optionCandidate.value !== 'string' ||
                        typeof optionCandidate.label !== 'string'
                      ) {
                        return null;
                      }

                      return {
                        value: optionCandidate.value,
                        label: optionCandidate.label,
                      };
                    })
                    .filter((option): option is { value: string; label: string } => Boolean(option))
                : undefined;

              return {
                id: questionCandidate.id,
                externalQuestionId:
                  typeof questionCandidate.externalQuestionId === 'string'
                    ? questionCandidate.externalQuestionId
                    : undefined,
                sectionId:
                  typeof questionCandidate.sectionId === 'string'
                    ? questionCandidate.sectionId
                    : undefined,
                label: questionCandidate.label,
                description:
                  typeof questionCandidate.description === 'string'
                    ? questionCandidate.description
                    : undefined,
                required:
                  typeof questionCandidate.required === 'boolean'
                    ? questionCandidate.required
                    : false,
                type: questionCandidate.type as PersistedFormStructureRecord['sections'][number]['questions'][number]['type'],
                ...(options && options.length > 0 ? { options } : {}),
                order: questionCandidate.order,
              };
            },
          )
          .filter(
            (
              question,
            ): question is PersistedFormStructureRecord['sections'][number]['questions'][number] =>
              Boolean(question),
          )
          .sort((left, right) => left.order - right.order);

        return {
          id: sectionCandidate.id,
          title: sectionCandidate.title,
          description:
            typeof sectionCandidate.description === 'string'
              ? sectionCandidate.description
              : undefined,
          order: sectionCandidate.order,
          questions,
        };
      })
      .filter((section): section is PersistedFormStructureRecord['sections'][number] =>
        Boolean(section),
      )
      .sort((left, right) => left.order - right.order);

    const questionCountFromSections = sections.reduce(
      (total, section) => total + section.questions.length,
      0,
    );
    const questionCount =
      typeof candidate.questionCount === 'number'
        ? candidate.questionCount
        : questionCountFromSections;

    return {
      sections,
      questionCount,
    };
  }

  async function loadFormStructure(formId: string): Promise<PersistedFormStructureRecord> {
    if (!db) {
      return {
        sections: [],
        questionCount: 0,
      };
    }

    const row = await db
      .selectFrom('forms')
      .select(['form_schema_json'])
      .where('id', '=', formId)
      .executeTakeFirst();

    const normalized = normalizePersistedFormStructureJson(row?.form_schema_json);
    if (!normalized) {
      return {
        sections: [],
        questionCount: 0,
      };
    }

    return normalized;
  }
  const formsAnalyticsQueryService = createFormsAnalyticsQueryService({
    db,
    loadFormResponses,
    loadFormStructure,
  });

  const jobsCommandService = deps?.db
    ? createJobsCommandService({
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
            .sort(
              (left, right) =>
                new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
            )
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

    const formStructure = await loadFormStructure(id);

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
      query.completion === 'completed' || query.completion === 'partial'
        ? query.completion
        : undefined;

    const allResponses = await loadFormResponses(id, resolvedForm.responseCount);
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

      if (
        questionId &&
        !response.answerPreview.some((preview) => preview.questionId === questionId)
      ) {
        return false;
      }

      if (
        answerContains &&
        !response.answerPreview.some((preview) =>
          preview.valuePreview.toLowerCase().includes(answerContains),
        )
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

  // GET /forms/:id/analytics
  zApp.get('/forms/:id/analytics', async (request, reply) => {
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

    const analytics = await formsAnalyticsQueryService.loadPersistedAnalyticsReport(id, resolvedForm.responseCount);
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

    const resolvedForm = await resolveAccessibleForm(id, principal.userId);
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

    const resolvedForm = await resolveAccessibleForm(id, principal.userId);
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

    const resolvedForm = await resolveAccessibleForm(id, principal.userId);
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
    const form = await resolveOwnedFormForSync(db, id, principal.userId);

    if (!form) {
      return reply.status(404).send({
        success: false,
        error: { code: 'not_found', message: 'Form not found' },
        meta: { requestId: request.id },
      });
    }

    if (!jobsCommandService) {
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

    const job = await jobsCommandService.enqueueSyncJob({
      requestedBy: principal.userId,
      connectionId: form.connectionId,
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









