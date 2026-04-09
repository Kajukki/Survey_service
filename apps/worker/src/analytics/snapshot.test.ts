import { describe, expect, it, vi } from 'vitest';
import { buildAnalyticsSnapshot, type SyncedResponse } from './snapshot.js';
import type { PersistedFormSchema } from './schema.js';

const schema: PersistedFormSchema = {
  source: 'google_forms_api',
  sections: [
    {
      id: 's-1',
      title: 'Main',
      order: 0,
      questions: [
        {
          id: 'q-rating',
          externalQuestionId: 'q-rating',
          sectionId: 's-1',
          label: 'Rating',
          required: false,
          type: 'rating',
          order: 0,
        },
        {
          id: 'q-choice',
          externalQuestionId: 'q-choice',
          sectionId: 's-1',
          label: 'Channel',
          required: false,
          type: 'single_choice',
          order: 1,
        },
        {
          id: 'q-text',
          externalQuestionId: 'q-text',
          sectionId: 's-1',
          label: 'Comment',
          required: false,
          type: 'text',
          order: 2,
        },
      ],
    },
  ],
  questionCount: 3,
};

const responses: SyncedResponse[] = [
  {
    submittedAt: '2026-01-01T10:00:00.000Z',
    completion: 'completed',
    answers: {
      'q-rating': '5',
      'q-choice': 'Organic',
      'q-text': 'Great experience',
    },
  },
  {
    submittedAt: '2026-01-03T10:00:00.000Z',
    completion: 'completed',
    answers: {
      'q-rating': '3',
      'q-choice': 'Referral',
      'q-text': 'Needs work',
    },
  },
  {
    submittedAt: '2026-01-02T10:00:00.000Z',
    completion: 'partial',
    answers: {
      'q-choice': 'Organic',
    },
  },
];

describe('buildAnalyticsSnapshot', () => {
  it('builds analytics for numeric, choice, and text questions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T00:00:00.000Z'));

    const snapshot = buildAnalyticsSnapshot(schema, responses);

    expect(snapshot.totalResponses).toBe(3);
    expect(snapshot.firstResponseTime).toBe('2026-01-01T10:00:00.000Z');
    expect(snapshot.lastResponseTime).toBe('2026-01-03T10:00:00.000Z');
    expect(snapshot.generatedAt).toBe('2026-01-05T00:00:00.000Z');
    expect(snapshot.scoreStats).toEqual({
      mean: 4,
      median: 4,
      min: 3,
      max: 5,
      standardDeviation: 1,
    });

    const rating = snapshot.questionAnalytics.find((item) => item.questionId === 'q-rating');
    expect(rating?.scaleAnalytics?.distribution).toEqual({ '3': 1, '5': 1 });

    const choice = snapshot.questionAnalytics.find((item) => item.questionId === 'q-choice');
    expect(choice?.selectAnalytics?.optionCounts).toEqual({ Organic: 2, Referral: 1 });

    const text = snapshot.questionAnalytics.find((item) => item.questionId === 'q-text');
    expect(text?.textAnalytics?.responses).toEqual(['Great experience', 'Needs work']);

    vi.useRealTimers();
  });
});
