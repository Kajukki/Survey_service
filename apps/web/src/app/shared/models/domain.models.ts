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

export type FormResponseCompletion = 'completed' | 'partial';

export interface FormResponseAnswerPreviewRecord {
  questionId: string;
  questionLabel: string;
  valuePreview: string;
}

export interface FormResponseSummaryRecord {
  id: string;
  submittedAt?: string;
  completion: FormResponseCompletion;
  answerPreview: FormResponseAnswerPreviewRecord[];
}

export type FormAnalyticsGranularity = 'day' | 'week' | 'month';

export interface FormAnalyticsKpiRecord {
  label: string;
  value: string;
  delta?: string;
}

export interface FormAnalyticsSeriesPointRecord {
  date: string;
  count: number;
}

export interface FormAnalyticsDistributionRecord {
  label: string;
  value: number;
}

export interface FormAnalyticsQuestionRecord {
  questionId: string;
  questionLabel: string;
  questionType: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
  responses: number;
  distribution?: FormAnalyticsDistributionRecord[];
}

export interface FormAnalyticsOverviewRecord {
  kpis: FormAnalyticsKpiRecord[];
  series: FormAnalyticsSeriesPointRecord[];
  appliedFilters: {
    from: string;
    to: string;
    granularity: FormAnalyticsGranularity;
    questionId?: string;
  };
  dataFreshness: {
    generatedAt: string;
    lastSuccessfulSyncAt?: string;
    lastAttemptedSyncAt?: string;
  };
}

export interface FormAnalyticsQuestionsRecord {
  questions: FormAnalyticsQuestionRecord[];
  appliedFilters: {
    from: string;
    to: string;
    granularity: FormAnalyticsGranularity;
    questionId?: string;
  };
  dataFreshness: {
    generatedAt: string;
    lastSuccessfulSyncAt?: string;
    lastAttemptedSyncAt?: string;
  };
}

export interface FormAnalyticsSegmentMetricRecord {
  label: string;
  value: number;
}

export interface FormAnalyticsSegmentRecord {
  segmentKey: string;
  segmentLabel: string;
  responses: number;
  completionRate?: number;
  metrics: FormAnalyticsSegmentMetricRecord[];
}

export interface FormAnalyticsSegmentsRecord {
  segments: FormAnalyticsSegmentRecord[];
  appliedFilters: {
    from: string;
    to: string;
    granularity: FormAnalyticsGranularity;
    segmentBy: string;
    questionId?: string;
  };
  dataFreshness: {
    generatedAt: string;
    lastSuccessfulSyncAt?: string;
    lastAttemptedSyncAt?: string;
  };
}

export interface AnalyticsNumericStatsRecord {
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number;
}

export interface FormAnalyticsQuestionRecordV2 {
  questionId: string;
  questionTitle: string;
  questionType: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
  answerCount: number;
  skippedCount: number;
  scaleAnalytics?: {
    distribution: Record<string, number>;
    stats: AnalyticsNumericStatsRecord;
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
    wordCountStats: AnalyticsNumericStatsRecord;
    charCountStats: AnalyticsNumericStatsRecord;
  };
}

export interface FormAnalyticsReportRecord {
  totalResponses: number;
  firstResponseTime?: string;
  lastResponseTime?: string;
  scoreStats?: AnalyticsNumericStatsRecord;
  questionAnalytics: FormAnalyticsQuestionRecordV2[];
  generatedAt: string;
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
