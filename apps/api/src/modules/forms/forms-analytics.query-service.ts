import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';

export type FormResponseRecord = {
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

export type PersistedFormStructureRecord = {
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

export type PersistedAnalyticsReport = {
  totalResponses: number;
  firstResponseTime?: string;
  lastResponseTime?: string;
  scoreStats?: NumericStatsRecord;
  questionAnalytics: PersistedAnalyticsQuestionRecord[];
  generatedAt: string;
};

export type AnalyticsGranularity = 'day' | 'week' | 'month';

export function parseAnalyticsGranularity(value: unknown): AnalyticsGranularity {
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
      const wordCounts = textResponses.map(
        (text) =>
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
                wordCountStats: computeNumericStats(wordCounts) ?? {
                  mean: 0,
                  median: 0,
                  min: 0,
                  max: 0,
                  standardDeviation: 0,
                },
                charCountStats: computeNumericStats(charCounts) ?? {
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
  segmentBy: 'completion' | 'channel',
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
          response.answerPreview.find((item) => item.questionId === segmentQuestionId)
            ?.valuePreview ?? 'unknown';
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
          value:
            value.scoreCount > 0 ? Number((value.scoreTotal / value.scoreCount).toFixed(2)) : 0,
        },
      ],
    }))
    .sort((left, right) => right.responses - left.responses);
}

function resolveDateRange(fromInput: unknown, toInput: unknown): { from: Date; to: Date } {
  const parseDateParam = (value: unknown): Date | null => {
    if (typeof value !== 'string') {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const now = new Date();
  const defaultTo = normalizeUtcDay(now);
  const defaultFrom = new Date(defaultTo);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

  return {
    from: parseDateParam(fromInput) ?? defaultFrom,
    to: parseDateParam(toInput) ?? defaultTo,
  };
}

export function createFormsAnalyticsQueryService(deps: {
  db?: Kysely<Database>;
  loadFormResponses: (formId: string, fallbackCount: number) => Promise<FormResponseRecord[]>;
  loadFormStructure: (formId: string) => Promise<PersistedFormStructureRecord>;
}) {
  async function loadPersistedAnalyticsReport(
    formId: string,
    fallbackResponseCount: number,
  ): Promise<PersistedAnalyticsReport> {
    if (!deps.db) {
      const mockResponses = await deps.loadFormResponses(formId, fallbackResponseCount);
      return buildPersistedAnalyticsReportFromResponses(
        { sections: [], questionCount: 0 },
        mockResponses,
      );
    }

    const analyticsDb = deps.db as unknown as Kysely<{
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

    const formStructure = await deps.loadFormStructure(formId);
    const responses = await deps.loadFormResponses(formId, fallbackResponseCount);
    return buildPersistedAnalyticsReportFromResponses(formStructure, responses);
  }

  async function getOverview(input: {
    formId: string;
    fallbackResponseCount: number;
    fromInput: unknown;
    toInput: unknown;
    granularityInput: unknown;
    questionId?: string;
  }) {
    const { from, to } = resolveDateRange(input.fromInput, input.toInput);
    const granularity = parseAnalyticsGranularity(input.granularityInput);

    const allResponses = await deps.loadFormResponses(input.formId, input.fallbackResponseCount);
    const formStructure = await deps.loadFormStructure(input.formId);
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

    const numericQuestionId = resolveNumericQuestionId(questionMetaMap, input.questionId);
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

    return {
      kpis: [
        {
          label: 'Responses in range',
          value: String(filteredResponses.length),
          delta: `${input.fallbackResponseCount} total`,
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
        ...(input.questionId ? { questionId: input.questionId } : {}),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async function getQuestions(input: {
    formId: string;
    fallbackResponseCount: number;
    fromInput: unknown;
    toInput: unknown;
    granularityInput: unknown;
    questionId?: string;
  }) {
    const { from, to } = resolveDateRange(input.fromInput, input.toInput);
    const granularity = parseAnalyticsGranularity(input.granularityInput);

    const allResponses = await deps.loadFormResponses(input.formId, input.fallbackResponseCount);
    const formStructure = await deps.loadFormStructure(input.formId);
    const filteredResponses = allResponses.filter((response) => {
      if (!response.submittedAt) {
        return false;
      }

      const submittedAt = new Date(response.submittedAt).getTime();
      return submittedAt >= from.getTime() && submittedAt <= to.getTime();
    });

    const questionMetaMap = buildQuestionMetaMap(formStructure, filteredResponses);

    return {
      questions: buildQuestionBreakdowns(questionMetaMap, filteredResponses, input.questionId),
      appliedFilters: {
        from: from.toISOString(),
        to: to.toISOString(),
        granularity,
        ...(input.questionId ? { questionId: input.questionId } : {}),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async function getSegments(input: {
    formId: string;
    fallbackResponseCount: number;
    fromInput: unknown;
    toInput: unknown;
    granularityInput: unknown;
    questionId?: string;
    segmentBy: 'completion' | 'channel';
  }) {
    const { from, to } = resolveDateRange(input.fromInput, input.toInput);
    const granularity = parseAnalyticsGranularity(input.granularityInput);

    const allResponses = await deps.loadFormResponses(input.formId, input.fallbackResponseCount);
    const formStructure = await deps.loadFormStructure(input.formId);
    const filteredResponses = allResponses.filter((response) => {
      if (!response.submittedAt) {
        return false;
      }

      const submittedAt = new Date(response.submittedAt).getTime();
      const inRange = submittedAt >= from.getTime() && submittedAt <= to.getTime();
      if (!inRange) {
        return false;
      }

      if (input.questionId) {
        return response.answerPreview.some((item) => item.questionId === input.questionId);
      }

      return true;
    });

    const questionMetaMap = buildQuestionMetaMap(formStructure, filteredResponses);

    return {
      segments: groupResponsesBySegment(
        questionMetaMap,
        filteredResponses,
        input.segmentBy,
        input.questionId,
      ),
      appliedFilters: {
        from: from.toISOString(),
        to: to.toISOString(),
        granularity,
        segmentBy: input.segmentBy,
        ...(input.questionId ? { questionId: input.questionId } : {}),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    loadPersistedAnalyticsReport,
    getOverview,
    getQuestions,
    getSegments,
  };
}
