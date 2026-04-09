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
      questionType?:
        | 'single_choice'
        | 'multi_choice'
        | 'text'
        | 'rating'
        | 'date'
        | 'number';
      valuePreview: string;
    }>;
    answers: Record<string, unknown>;
  };

  type FormQuestionMeta = {
    id: string;
    label: string;
    type: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
    options?: string[];
  };

  type NumericStatsRecord = {
    mean: number;
    median: number;
    min: number;
    max: number;
    standardDeviation: number;
  };

  type PersistedAnalyticsQuestionRecord = {
    questionId: string;
    questionTitle: string;
    questionType: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
    answerCount: number;
    skippedCount: number;
    scaleAnalytics?: {
      distribution: Record<string, number>;
      stats: NumericStatsRecord;
    };
    selectAnalytics?: {
      isMultiChoice: boolean;
      optionCounts: Record<string, number>;
      optionPercentages: Record<string, number>;
      mostPopular: string[];
      totalSelections: number;
    };
    textAnalytics?: {
      responses: string[];
      wordCountStats: NumericStatsRecord;
      charCountStats: NumericStatsRecord;
    };
  };

  type PersistedAnalyticsReport = {
    totalResponses: number;
    firstResponseTime?: string;
    lastResponseTime?: string;
    scoreStats?: NumericStatsRecord;
    questionAnalytics: PersistedAnalyticsQuestionRecord[];
    generatedAt: string;
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
          ...((candidate.questionType === 'single_choice' ||
            candidate.questionType === 'multi_choice' ||
            candidate.questionType === 'text' ||
            candidate.questionType === 'rating' ||
            candidate.questionType === 'date' ||
            candidate.questionType === 'number')
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

  function normalizePersistedFormStructureJson(value: unknown): PersistedFormStructureRecord | null {
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
          .map((question): PersistedFormStructureRecord['sections'][number]['questions'][number] | null => {
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
                typeof questionCandidate.sectionId === 'string' ? questionCandidate.sectionId : undefined,
              label: questionCandidate.label,
              description:
                typeof questionCandidate.description === 'string' ? questionCandidate.description : undefined,
              required: typeof questionCandidate.required === 'boolean' ? questionCandidate.required : false,
              type: questionCandidate.type as PersistedFormStructureRecord['sections'][number]['questions'][number]['type'],
              ...(options && options.length > 0 ? { options } : {}),
              order: questionCandidate.order,
            };
          })
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
            typeof sectionCandidate.description === 'string' ? sectionCandidate.description : undefined,
          order: sectionCandidate.order,
          questions,
        };
      })
      .filter((section): section is PersistedFormStructureRecord['sections'][number] => Boolean(section))
      .sort((left, right) => left.order - right.order);

    const questionCountFromSections = sections.reduce(
      (total, section) => total + section.questions.length,
      0,
    );
    const questionCount =
      typeof candidate.questionCount === 'number' ? candidate.questionCount : questionCountFromSections;

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

  function extractAnswerValues(answer: unknown): string[] {
    if (answer === null || answer === undefined) {
      return [];
    }

    if (typeof answer === 'string' || typeof answer === 'number' || typeof answer === 'boolean') {
      const value = String(answer).trim();
      return value.length > 0 ? [value] : [];
    }

    if (Array.isArray(answer)) {
      return answer.flatMap((item) => extractAnswerValues(item));
    }

    if (typeof answer === 'object') {
      const candidate = answer as Record<string, unknown>;
      const choiceAnswers = candidate.choiceAnswers as { answers?: unknown[] } | undefined;
      if (choiceAnswers?.answers && Array.isArray(choiceAnswers.answers)) {
        return choiceAnswers.answers.flatMap((item) => extractAnswerValues(item));
      }

      const textAnswers = candidate.textAnswers as
        | { answers?: Array<{ value?: string }> }
        | undefined;
      if (textAnswers?.answers && Array.isArray(textAnswers.answers)) {
        return textAnswers.answers
          .map((item) => (typeof item?.value === 'string' ? item.value.trim() : ''))
          .filter((item) => item.length > 0);
      }

      return [];
    }

    return [];
  }

  function computeNumericStats(values: number[]): NumericStatsRecord | null {
    if (values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const sum = values.reduce((total, value) => total + value, 0);
    const mean = sum / values.length;
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
        : sorted[Math.floor(sorted.length / 2)]!;
    const variance =
      values.reduce((total, value) => total + (value - mean) * (value - mean), 0) / values.length;

    return {
      mean: Number(mean.toFixed(2)),
      median: Number(median.toFixed(2)),
      min: sorted[0]!,
      max: sorted[sorted.length - 1]!,
      standardDeviation: Number(Math.sqrt(variance).toFixed(2)),
    };
  }

  function buildPersistedAnalyticsReportFromResponses(
    formStructure: PersistedFormStructureRecord,
    responses: FormResponseRecord[],
  ): PersistedAnalyticsReport {
    const questionMetaMap = buildQuestionMetaMap(formStructure, responses);
    const totalResponses = responses.length;
    const responseTimes = responses
      .map((response) => (response.submittedAt ? Date.parse(response.submittedAt) : Number.NaN))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);

    const questionAnalytics: PersistedAnalyticsQuestionRecord[] = [...questionMetaMap.values()].map(
      (meta) => {
        const valuesByResponse = responses.map((response) => {
          const values = extractAnswerValues(response.answers[meta.id]);
          if (values.length > 0) {
            return values;
          }

          const preview = response.answerPreview.find((item) => item.questionId === meta.id);
          return preview ? [preview.valuePreview] : [];
        });

        const answeredValues = valuesByResponse.flatMap((value) => value);
        const answerCount = valuesByResponse.filter((values) => values.length > 0).length;
        const skippedCount = Math.max(0, totalResponses - answerCount);

        if (meta.type === 'rating' || meta.type === 'number') {
          const numericValues = answeredValues
            .map((value) => Number.parseFloat(value))
            .filter((value) => Number.isFinite(value));
          const stats = computeNumericStats(numericValues);
          const distribution = new Map<string, number>();
          for (const numericValue of numericValues) {
            const key = String(numericValue);
            distribution.set(key, (distribution.get(key) ?? 0) + 1);
          }

          return {
            questionId: meta.id,
            questionTitle: meta.label,
            questionType: meta.type,
            answerCount,
            skippedCount,
            ...(stats
              ? {
                  scaleAnalytics: {
                    distribution: Object.fromEntries(distribution.entries()),
                    stats,
                  },
                }
              : {}),
          };
        }

        if (meta.type === 'single_choice' || meta.type === 'multi_choice') {
          const optionCounts = new Map<string, number>();
          for (const value of answeredValues) {
            optionCounts.set(value, (optionCounts.get(value) ?? 0) + 1);
          }

          const totalSelections = answeredValues.length;
          const optionPercentages = Object.fromEntries(
            [...optionCounts.entries()].map(([option, count]) => [
              option,
              totalSelections > 0 ? Number(((count / totalSelections) * 100).toFixed(1)) : 0,
            ]),
          );
          const mostPopular = [...optionCounts.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 3)
            .map(([option]) => option);

          return {
            questionId: meta.id,
            questionTitle: meta.label,
            questionType: meta.type,
            answerCount,
            skippedCount,
            selectAnalytics: {
              isMultiChoice: meta.type === 'multi_choice',
              optionCounts: Object.fromEntries(optionCounts.entries()),
              optionPercentages,
              mostPopular,
              totalSelections,
            },
          };
        }

        const textResponses = answeredValues.filter((value) => value.trim().length > 0).slice(0, 200);
        const wordCounts = textResponses.map((text) =>
          text
            .trim()
            .split(/\s+/)
            .filter((token) => token.length > 0).length,
        );
        const charCounts = textResponses.map((text) => text.length);

        return {
          questionId: meta.id,
          questionTitle: meta.label,
          questionType: meta.type,
          answerCount,
          skippedCount,
          ...(textResponses.length > 0
            ? {
                textAnalytics: {
                  responses: textResponses,
                  wordCountStats:
                    computeNumericStats(wordCounts) ?? {
                      mean: 0,
                      median: 0,
                      min: 0,
                      max: 0,
                      standardDeviation: 0,
                    },
                  charCountStats:
                    computeNumericStats(charCounts) ?? {
                      mean: 0,
                      median: 0,
                      min: 0,
                      max: 0,
                      standardDeviation: 0,
                    },
                },
              }
            : {}),
        };
      },
    );

    const scoreStats = questionAnalytics.find(
      (question) => question.questionType === 'rating' || question.questionType === 'number',
    )?.scaleAnalytics?.stats;

    return {
      totalResponses,
      firstResponseTime:
        responseTimes.length > 0 ? new Date(responseTimes[0]!).toISOString() : undefined,
      lastResponseTime:
        responseTimes.length > 0
          ? new Date(responseTimes[responseTimes.length - 1]!).toISOString()
          : undefined,
      ...(scoreStats ? { scoreStats } : {}),
      questionAnalytics,
      generatedAt: new Date().toISOString(),
    };
  }

  function normalizePersistedAnalyticsReport(value: unknown): PersistedAnalyticsReport | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as Record<string, unknown>;
    if (typeof candidate.totalResponses !== 'number' || !Array.isArray(candidate.questionAnalytics)) {
      return null;
    }

    if (typeof candidate.generatedAt !== 'string') {
      return null;
    }

    return candidate as PersistedAnalyticsReport;
  }

  async function loadPersistedAnalyticsReport(
    formId: string,
    fallbackResponseCount: number,
  ): Promise<PersistedAnalyticsReport> {
    if (!db) {
      const mockResponses = buildMockResponses(formId, fallbackResponseCount);
      return buildPersistedAnalyticsReportFromResponses({ sections: [], questionCount: 0 }, mockResponses);
    }

    const analyticsDb = db as unknown as Kysely<{
      form_analytics_snapshots: {
        form_id: string;
        analytics_json: unknown;
      };
    }>;

    const row = await analyticsDb
      .selectFrom('form_analytics_snapshots')
      .select(['analytics_json'])
      .where('form_id', '=', formId)
      .executeTakeFirst();

    const normalized = normalizePersistedAnalyticsReport(row?.analytics_json);
    if (normalized) {
      return normalized;
    }

    const formStructure = await loadFormStructure(formId);
    const responses = await loadFormResponses(formId, fallbackResponseCount);
    return buildPersistedAnalyticsReportFromResponses(formStructure, responses);
  }

  function buildQuestionMetaMap(
    structure: PersistedFormStructureRecord,
    responses: FormResponseRecord[],
  ): Map<string, FormQuestionMeta> {
    const map = new Map<string, FormQuestionMeta>();

    for (const section of structure.sections) {
      for (const question of section.questions) {
        map.set(question.id, {
          id: question.id,
          label: question.label,
          type: question.type,
          options: question.options?.map((option) => option.label),
        });
      }
    }

    for (const response of responses) {
      for (const preview of response.answerPreview) {
        if (map.has(preview.questionId)) {
          continue;
        }

        map.set(preview.questionId, {
          id: preview.questionId,
          label: preview.questionLabel,
          type: preview.questionType ?? 'text',
        });
      }
    }

    return map;
  }

  function resolveNumericQuestionId(
    questionMetaMap: Map<string, FormQuestionMeta>,
    requestedQuestionId?: string,
  ): string | undefined {
    const requested = requestedQuestionId ? questionMetaMap.get(requestedQuestionId) : undefined;
    if (requested && (requested.type === 'rating' || requested.type === 'number')) {
      return requested.id;
    }

    for (const question of questionMetaMap.values()) {
      if (question.type === 'rating' || question.type === 'number') {
        return question.id;
      }
    }

    return undefined;
  }

  function buildQuestionBreakdowns(
    questionMetaMap: Map<string, FormQuestionMeta>,
    responses: FormResponseRecord[],
    questionId?: string,
  ) {
    const selectedQuestionIds = questionId
      ? questionMetaMap.has(questionId)
        ? [questionId]
        : []
      : [...questionMetaMap.keys()];

    return selectedQuestionIds.map((selectedQuestionId) => {
      const meta = questionMetaMap.get(selectedQuestionId)!;
      const distribution = new Map<string, number>();
      let responseCount = 0;

      for (const response of responses) {
        const rawAnswer = response.answers[selectedQuestionId];
        const preview = response.answerPreview.find((item) => item.questionId === selectedQuestionId);
        const values = [
          ...extractAnswerValues(rawAnswer),
          ...(rawAnswer === undefined && preview ? [preview.valuePreview] : []),
        ].filter((value) => value.trim().length > 0);

        if (values.length === 0) {
          continue;
        }

        responseCount += 1;
        for (const value of values) {
          distribution.set(value, (distribution.get(value) ?? 0) + 1);
        }
      }

      const distributionItems = [...distribution.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 10);

      return {
        questionId: meta.id,
        questionLabel: meta.label,
        questionType: meta.type,
        responses: responseCount,
        ...(meta.type === 'text' ? {} : { distribution: distributionItems }),
      };
    });
  }

  function groupResponsesBySegment(
    questionMetaMap: Map<string, FormQuestionMeta>,
    responses: FormResponseRecord[],
    segmentBy: string,
    requestedQuestionId?: string,
  ) {
    const numericQuestionId = resolveNumericQuestionId(questionMetaMap, requestedQuestionId);
    const segmentQuestionId =
      segmentBy === 'channel'
        ? requestedQuestionId && questionMetaMap.has(requestedQuestionId)
          ? requestedQuestionId
          : [...questionMetaMap.values()].find(
              (question) => question.type === 'single_choice' || question.type === 'multi_choice',
            )?.id
        : undefined;

    const grouped = new Map<
      string,
      {
        responses: number;
        completed: number;
        scoreTotal: number;
        scoreCount: number;
      }
    >();

    for (const response of responses) {
      let key = 'unknown';

      if (segmentBy === 'completion') {
        key = response.completion;
      } else if (segmentQuestionId) {
        const rawSegment = response.answers[segmentQuestionId];
        const segmentValues = extractAnswerValues(rawSegment);
        if (segmentValues.length > 0) {
          key = segmentValues[0]!;
        } else {
          key =
            response.answerPreview.find((item) => item.questionId === segmentQuestionId)?.valuePreview ??
            'unknown';
        }
      }

      const current = grouped.get(key) ?? {
        responses: 0,
        completed: 0,
        scoreTotal: 0,
        scoreCount: 0,
      };

      current.responses += 1;
      if (response.completion === 'completed') {
        current.completed += 1;
      }

      if (numericQuestionId) {
        const numericValues = extractAnswerValues(response.answers[numericQuestionId])
          .map((value) => Number.parseFloat(value))
          .filter((value) => Number.isFinite(value));

        if (numericValues.length > 0) {
          current.scoreTotal += numericValues.reduce((total, value) => total + value, 0);
          current.scoreCount += numericValues.length;
        }
      }

      grouped.set(key, current);
    }

    return [...grouped.entries()]
      .map(([segmentKey, value]) => ({
        segmentKey,
        segmentLabel:
          segmentKey === 'completed'
            ? 'Completed'
            : segmentKey === 'partial'
              ? 'Partial'
              : segmentKey === 'unknown'
                ? 'Unknown'
                : segmentKey,
        responses: value.responses,
        completionRate: value.responses > 0 ? value.completed / value.responses : 0,
        metrics: [
          {
            label: 'avgValue',
            value: value.scoreCount > 0 ? Number((value.scoreTotal / value.scoreCount).toFixed(2)) : 0,
          },
        ],
      }))
      .sort((left, right) => right.responses - left.responses);
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

    const analytics = await loadPersistedAnalyticsReport(id, resolvedForm.responseCount);
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

    const now = new Date();
    const defaultTo = normalizeUtcDay(now);
    const defaultFrom = new Date(defaultTo);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const from = parseDateParam(query.from) ?? defaultFrom;
    const to = parseDateParam(query.to) ?? defaultTo;
    const granularity = parseAnalyticsGranularity(query.granularity);
    const questionId = typeof query.questionId === 'string' ? query.questionId : undefined;

    const allResponses = await loadFormResponses(id, resolvedForm.responseCount);
    const formStructure = await loadFormStructure(id);
    const filteredResponses = allResponses.filter((response) => {
      if (!response.submittedAt) {
        return false;
      }

      const submittedAt = new Date(response.submittedAt).getTime();
      return submittedAt >= from.getTime() && submittedAt <= to.getTime();
    });

    const questionMetaMap = buildQuestionMetaMap(formStructure, filteredResponses);

    const completedResponses = filteredResponses.filter(
      (response) => response.completion === 'completed',
    ).length;
    const completionRate =
      filteredResponses.length > 0
        ? Math.round((completedResponses / filteredResponses.length) * 100)
        : 0;

    const numericQuestionId = resolveNumericQuestionId(questionMetaMap, questionId);
    const scoreValues = numericQuestionId
      ? filteredResponses
          .flatMap((response) => extractAnswerValues(response.answers[numericQuestionId]))
          .map((value) => Number.parseFloat(value))
          .filter((value) => Number.isFinite(value))
      : [];

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
            label: numericQuestionId
              ? `Avg ${questionMetaMap.get(numericQuestionId)?.label ?? 'score'}`
              : 'Avg score',
            value: averageScore,
            delta: numericQuestionId ? 'Numeric/rating responses' : 'No numeric question found',
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

    const allResponses = await loadFormResponses(id, resolvedForm.responseCount);
    const formStructure = await loadFormStructure(id);
    const filteredResponses = allResponses.filter((response) => {
      if (!response.submittedAt) {
        return false;
      }

      const submittedAt = new Date(response.submittedAt).getTime();
      return submittedAt >= from.getTime() && submittedAt <= to.getTime();
    });

    const questionMetaMap = buildQuestionMetaMap(formStructure, filteredResponses);

    return reply.send({
      success: true,
      data: {
        questions: buildQuestionBreakdowns(questionMetaMap, filteredResponses, questionId),
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

    const now = new Date();
    const defaultTo = normalizeUtcDay(now);
    const defaultFrom = new Date(defaultTo);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const from = parseDateParam(query.from) ?? defaultFrom;
    const to = parseDateParam(query.to) ?? defaultTo;
    const granularity = parseAnalyticsGranularity(query.granularity);
    const questionId = typeof query.questionId === 'string' ? query.questionId : undefined;
    const segmentBy = query.segmentBy === 'channel' ? 'channel' : 'completion';

    const allResponses = await loadFormResponses(id, resolvedForm.responseCount);
    const formStructure = await loadFormStructure(id);
    const filteredResponses = allResponses.filter((response) => {
      if (!response.submittedAt) {
        return false;
      }

      const submittedAt = new Date(response.submittedAt).getTime();
      const inRange = submittedAt >= from.getTime() && submittedAt <= to.getTime();
      if (!inRange) {
        return false;
      }

      if (questionId) {
        return response.answerPreview.some((item) => item.questionId === questionId);
      }

      return true;
    });

    const questionMetaMap = buildQuestionMetaMap(formStructure, filteredResponses);

    return reply.send({
      success: true,
      data: {
        segments: groupResponsesBySegment(questionMetaMap, filteredResponses, segmentBy, questionId),
        appliedFilters: {
          from: from.toISOString(),
          to: to.toISOString(),
          granularity,
          segmentBy,
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
