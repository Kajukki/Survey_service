import type { NumericStats } from './stats.js';
import { computeNumericStats } from './stats.js';
import type { PersistedFormSchema } from './schema.js';

export type SyncedResponse = {
  submittedAt?: string;
  completion: 'completed' | 'partial';
  answers: Record<string, unknown>;
};

export type PersistedAnalyticsQuestion = {
  questionId: string;
  questionTitle: string;
  questionType: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
  answerCount: number;
  skippedCount: number;
  scaleAnalytics?: {
    distribution: Record<string, number>;
    stats: NumericStats;
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
    wordCountStats: NumericStats;
    charCountStats: NumericStats;
  };
};

export type PersistedAnalyticsSnapshot = {
  totalResponses: number;
  firstResponseTime?: string;
  lastResponseTime?: string;
  scoreStats?: NumericStats;
  questionAnalytics: PersistedAnalyticsQuestion[];
  generatedAt: string;
};

function extractAnswerValues(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const normalized = String(value).trim();
    return normalized.length > 0 ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractAnswerValues(item));
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
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
  }

  return [];
}

export function buildAnalyticsSnapshot(
  schema: PersistedFormSchema,
  responses: SyncedResponse[],
): PersistedAnalyticsSnapshot {
  const responseTimes = responses
    .map((response) => (response.submittedAt ? Date.parse(response.submittedAt) : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  const flattenedQuestions = schema.sections
    .flatMap((section) => section.questions)
    .sort((left, right) => left.order - right.order);

  const questionAnalytics: PersistedAnalyticsQuestion[] = flattenedQuestions.map((question) => {
    const valuesByResponse = responses.map((response) =>
      extractAnswerValues(response.answers[question.id]),
    );
    const answeredValues = valuesByResponse.flatMap((value) => value);
    const answerCount = valuesByResponse.filter((values) => values.length > 0).length;
    const skippedCount = Math.max(0, responses.length - answerCount);

    if (question.type === 'rating' || question.type === 'number') {
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
        questionId: question.id,
        questionTitle: question.label,
        questionType: question.type,
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

    if (question.type === 'single_choice' || question.type === 'multi_choice') {
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
        questionId: question.id,
        questionTitle: question.label,
        questionType: question.type,
        answerCount,
        skippedCount,
        selectAnalytics: {
          isMultiChoice: question.type === 'multi_choice',
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
      questionId: question.id,
      questionTitle: question.label,
      questionType: question.type,
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
  });

  const primaryScoreQuestion = questionAnalytics.find(
    (question) => question.questionType === 'rating' || question.questionType === 'number',
  );

  return {
    totalResponses: responses.length,
    firstResponseTime:
      responseTimes.length > 0 ? new Date(responseTimes[0]!).toISOString() : undefined,
    lastResponseTime:
      responseTimes.length > 0
        ? new Date(responseTimes[responseTimes.length - 1]!).toISOString()
        : undefined,
    scoreStats: primaryScoreQuestion?.scaleAnalytics?.stats,
    questionAnalytics,
    generatedAt: new Date().toISOString(),
  };
}
