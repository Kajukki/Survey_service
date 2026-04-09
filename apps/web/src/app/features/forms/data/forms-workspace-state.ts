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
  search?: string;
  questionId?: string;
  responsesPage: number;
  responsesPerPage: number;
}

export function defaultFormsWorkspaceState(): FormsWorkspaceState {
  return {
    tab: 'overview',
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
    search: typeof params['search'] === 'string' ? params['search'] : undefined,
    questionId: typeof params['questionId'] === 'string' ? params['questionId'] : undefined,
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

  if (state.search) {
    params['search'] = state.search;
  }

  if (state.questionId) {
    params['questionId'] = state.questionId;
  }

  return params;
}
