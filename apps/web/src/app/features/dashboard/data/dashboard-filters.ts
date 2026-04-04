import { Params } from '@angular/router';

import { DashboardFilters, Granularity } from '../../../shared/models/domain.models';

const TODAY = new Date();
const THIRTY_DAYS_AGO = new Date(TODAY.getTime() - 29 * 24 * 60 * 60 * 1000);

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function defaultDashboardFilters(): DashboardFilters {
  return {
    formId: '',
    from: toIsoDate(THIRTY_DAYS_AGO),
    to: toIsoDate(TODAY),
    granularity: 'day',
  };
}

export function parseDashboardFilters(params: Params): DashboardFilters {
  const defaults = defaultDashboardFilters();
  const granularity = normalizeGranularity(params['granularity']);
  const formId = String(params['formId'] ?? defaults.formId).trim();
  const from = normalizeDate(String(params['from'] ?? defaults.from), defaults.from);
  const to = normalizeDate(String(params['to'] ?? defaults.to), defaults.to);

  const normalized = from <= to ? { from, to } : { from: defaults.from, to: defaults.to };

  return {
    formId,
    granularity,
    from: normalized.from,
    to: normalized.to,
    questionId: params['questionId'] ? String(params['questionId']) : undefined,
  };
}

export function buildDashboardQueryParams(filters: DashboardFilters): Params {
  return {
    formId: filters.formId,
    from: filters.from,
    to: filters.to,
    granularity: filters.granularity,
    questionId: filters.questionId,
  };
}

function normalizeGranularity(value: unknown): Granularity {
  if (value === 'week' || value === 'month') {
    return value;
  }

  return 'day';
}

function normalizeDate(value: string, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}
