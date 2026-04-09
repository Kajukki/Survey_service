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
      search: 'satisfaction',
      completion: 'completed',
      responsesPage: '3',
      responsesPerPage: '50',
    });

    expect(parsed).toEqual({
      tab: 'questions',
      questionType: 'single_choice',
      search: 'satisfaction',
      questionId: undefined,
      completion: 'completed',
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
  });

  it('builds query params from state', () => {
    const params = buildFormsWorkspaceQueryParams({
      tab: 'responses',
      questionId: 'q1',
      questionType: 'text',
      search: 'hello',
      completion: 'partial',
      responsesPage: 2,
      responsesPerPage: 25,
    });

    expect(params).toEqual({
      tab: 'responses',
      questionId: 'q1',
      questionType: 'text',
      search: 'hello',
      completion: 'partial',
      responsesPage: '2',
      responsesPerPage: '25',
    });
  });
});
