export type Granularity = 'day' | 'week' | 'month';

export interface DashboardFilters {
  formId: string;
  from: string;
  to: string;
  granularity: Granularity;
  questionId?: string;
}

export interface DashboardKpi {
  label: string;
  value: string;
  delta: string;
}

export interface DashboardSeriesPoint {
  date: string;
  count: number;
}

export interface QuestionSummary {
  id: string;
  label: string;
  responses: number;
  distribution: Array<{ label: string; value: number }>;
}

export interface DashboardPayload {
  kpis: DashboardKpi[];
  series: DashboardSeriesPoint[];
  questions: QuestionSummary[];
}

export interface Connection {
  id: string;
  provider: 'google' | 'microsoft';
  status: 'connected' | 'attention';
  owner: string;
  updatedAt: string;
}

export interface FormRecord {
  id: string;
  title: string;
  owner: string;
  visibility: 'owned' | 'shared';
  updatedAt: string;
}

export interface FormQuestionRecord {
  id: string;
  label: string;
  description?: string;
  type: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
  required: boolean;
}

export interface FormSectionRecord {
  id: string;
  title: string;
  description?: string;
  questions: FormQuestionRecord[];
}

export interface FormStructureRecord {
  formId: string;
  title: string;
  ownerId: string;
  description?: string;
  responseCount: number;
  updatedAt: string;
  lastSyncedAt?: string;
  sections: FormSectionRecord[];
  questionCount: number;
}

export interface SyncJob {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  createdAt: string;
  source: string;
}

export interface ExportRecord {
  id: string;
  format: 'csv' | 'xlsx';
  status: 'queued' | 'ready';
  requestedAt: string;
}

export interface SharingRecord {
  id: string;
  resource: string;
  principal: string;
  role: 'viewer' | 'editor';
}
