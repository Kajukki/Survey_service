import { Params } from '@angular/router';

export type FormsWorkspaceTab = 'overview' | 'questions' | 'responses' | 'analytics';

const ALLOWED_TABS: ReadonlySet<FormsWorkspaceTab> = new Set([
  'overview',
  'questions',
  'responses',
  'analytics',
]);

export interface FormsWorkspaceState {
  tab: FormsWorkspaceTab;
  questionType?: string;
  questionSearch?: string;
  responseSearch?: string;
  responseQuestionId?: string;
  completion?: 'completed' | 'partial';
  analyticsQuestionId?: string;
  analyticsSegmentBy: 'completion' | 'channel';
  analyticsFrom: string;
  analyticsTo: string;
  analyticsGranularity: 'day' | 'week' | 'month';
  responsesPage: number;
  responsesPerPage: number;
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function defaultFormsWorkspaceState(): FormsWorkspaceState {
  const today = new Date();
  const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const defaultFrom = new Date(defaultTo);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

  return {
    tab: 'overview',
    analyticsSegmentBy: 'completion',
    analyticsFrom: formatDateOnly(defaultFrom),
    analyticsTo: formatDateOnly(defaultTo),
    analyticsGranularity: 'day',
    responsesPage: 1,
    responsesPerPage: 20,
  };
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

export function parseFormsWorkspaceState(params: Params): FormsWorkspaceState {
  const defaults = defaultFormsWorkspaceState();
  const tabCandidate = params['tab'];

  return {
    tab:
      typeof tabCandidate === 'string' && ALLOWED_TABS.has(tabCandidate as FormsWorkspaceTab)
        ? (tabCandidate as FormsWorkspaceTab)
        : defaults.tab,
    questionType: typeof params['questionType'] === 'string' ? params['questionType'] : undefined,
    questionSearch:
      typeof params['questionSearch'] === 'string'
        ? params['questionSearch']
        : typeof params['search'] === 'string'
          ? params['search']
          : undefined,
    responseSearch:
      typeof params['responseSearch'] === 'string'
        ? params['responseSearch']
        : typeof params['search'] === 'string'
          ? params['search']
          : undefined,
    responseQuestionId:
      typeof params['responseQuestionId'] === 'string'
        ? params['responseQuestionId']
        : typeof params['questionId'] === 'string'
          ? params['questionId']
          : undefined,
    completion:
      params['completion'] === 'completed' || params['completion'] === 'partial'
        ? params['completion']
        : undefined,
    analyticsQuestionId:
      typeof params['analyticsQuestionId'] === 'string'
        ? params['analyticsQuestionId']
        : typeof params['questionId'] === 'string'
          ? params['questionId']
          : undefined,
    analyticsSegmentBy:
      params['analyticsSegmentBy'] === 'completion' || params['analyticsSegmentBy'] === 'channel'
        ? params['analyticsSegmentBy']
        : defaults.analyticsSegmentBy,
    analyticsFrom:
      typeof params['analyticsFrom'] === 'string' && params['analyticsFrom'].length > 0
        ? params['analyticsFrom']
        : defaults.analyticsFrom,
    analyticsTo:
      typeof params['analyticsTo'] === 'string' && params['analyticsTo'].length > 0
        ? params['analyticsTo']
        : defaults.analyticsTo,
    analyticsGranularity:
      params['analyticsGranularity'] === 'day' ||
      params['analyticsGranularity'] === 'week' ||
      params['analyticsGranularity'] === 'month'
        ? params['analyticsGranularity']
        : defaults.analyticsGranularity,
    responsesPage: parsePositiveInt(params['responsesPage'], defaults.responsesPage),
    responsesPerPage: Math.min(parsePositiveInt(params['responsesPerPage'], defaults.responsesPerPage), 100),
  };
}

export function buildFormsWorkspaceQueryParams(state: FormsWorkspaceState): Params {
  const params: Params = {
    tab: state.tab,
    responsesPage: String(state.responsesPage),
    responsesPerPage: String(state.responsesPerPage),
  };

  if (state.questionType) {
    params['questionType'] = state.questionType;
  }

  if (state.questionSearch) {
    params['questionSearch'] = state.questionSearch;
  }

  if (state.responseSearch) {
    params['responseSearch'] = state.responseSearch;
  }

  if (state.responseQuestionId) {
    params['responseQuestionId'] = state.responseQuestionId;
  }

  if (state.completion) {
    params['completion'] = state.completion;
  }

  if (state.analyticsQuestionId) {
    params['analyticsQuestionId'] = state.analyticsQuestionId;
  }

  params['analyticsSegmentBy'] = state.analyticsSegmentBy;

  params['analyticsFrom'] = state.analyticsFrom;
  params['analyticsTo'] = state.analyticsTo;
  params['analyticsGranularity'] = state.analyticsGranularity;

  return params;
}
