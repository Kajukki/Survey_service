import { describe, expect, it } from 'vitest';
import {
  buildFormsWorkspaceQueryParams,
  defaultFormsWorkspaceState,
  parseFormsWorkspaceState,
} from './forms-workspace-state';

describe('forms workspace state', () => {
  it('parses valid query params', () => {
    const parsed = parseFormsWorkspaceState({
      tab: 'questions',
      questionType: 'single_choice',
      questionSearch: 'satisfaction',
      responseSearch: 'contains text',
      responseQuestionId: 'q-overall',
      completion: 'completed',
      analyticsQuestionId: 'q-comment',
      analyticsSegmentBy: 'channel',
      analyticsFrom: '2026-03-01',
      analyticsTo: '2026-03-31',
      analyticsGranularity: 'week',
      responsesPage: '3',
      responsesPerPage: '50',
    });

    expect(parsed).toEqual({
      tab: 'questions',
      questionType: 'single_choice',
      questionSearch: 'satisfaction',
      responseSearch: 'contains text',
      responseQuestionId: 'q-overall',
      completion: 'completed',
      analyticsQuestionId: 'q-comment',
      analyticsSegmentBy: 'channel',
      analyticsFrom: '2026-03-01',
      analyticsTo: '2026-03-31',
      analyticsGranularity: 'week',
      responsesPage: 3,
      responsesPerPage: 50,
    });
  });

  it('falls back to defaults for invalid query params', () => {
    const defaults = defaultFormsWorkspaceState();
    const parsed = parseFormsWorkspaceState({
      tab: 'bad',
      responsesPage: '-2',
      responsesPerPage: '1000',
    });

    expect(parsed.tab).toBe(defaults.tab);
    expect(parsed.responsesPage).toBe(defaults.responsesPage);
    expect(parsed.responsesPerPage).toBe(100);
    expect(parsed.analyticsFrom).toBe(defaults.analyticsFrom);
    expect(parsed.analyticsTo).toBe(defaults.analyticsTo);
    expect(parsed.analyticsGranularity).toBe(defaults.analyticsGranularity);
    expect(parsed.analyticsSegmentBy).toBe(defaults.analyticsSegmentBy);
  });

  it('builds query params from state', () => {
    const params = buildFormsWorkspaceQueryParams({
      tab: 'responses',
      responseQuestionId: 'q1',
      questionType: 'text',
      questionSearch: 'keyword',
      responseSearch: 'hello',
      completion: 'partial',
      analyticsQuestionId: 'q2',
      analyticsSegmentBy: 'completion',
      analyticsFrom: '2026-03-01',
      analyticsTo: '2026-03-31',
      analyticsGranularity: 'month',
      responsesPage: 2,
      responsesPerPage: 25,
    });

    expect(params).toEqual({
      tab: 'responses',
      responseQuestionId: 'q1',
      questionType: 'text',
      questionSearch: 'keyword',
      responseSearch: 'hello',
      completion: 'partial',
      analyticsQuestionId: 'q2',
      analyticsSegmentBy: 'completion',
      analyticsFrom: '2026-03-01',
      analyticsTo: '2026-03-31',
      analyticsGranularity: 'month',
      responsesPage: '2',
      responsesPerPage: '25',
    });
  });

  it('maps legacy questionId alias when scoped ids are missing', () => {
    const parsed = parseFormsWorkspaceState({
      questionId: 'legacy-question-id',
    });

    expect(parsed.responseQuestionId).toBe('legacy-question-id');
    expect(parsed.analyticsQuestionId).toBe('legacy-question-id');
  });

  it('omits optional query params when values are undefined', () => {
    const params = buildFormsWorkspaceQueryParams({
      ...defaultFormsWorkspaceState(),
      tab: 'overview',
      questionSearch: undefined,
      responseSearch: undefined,
      responseQuestionId: undefined,
      completion: undefined,
      analyticsQuestionId: undefined,
    });

    expect(params['questionSearch']).toBeUndefined();
    expect(params['responseSearch']).toBeUndefined();
    expect(params['responseQuestionId']).toBeUndefined();
    expect(params['completion']).toBeUndefined();
    expect(params['analyticsQuestionId']).toBeUndefined();
  });
});
