import { describe, expect, it } from 'vitest';

import {
  buildDashboardQueryParams,
  defaultDashboardFilters,
  parseDashboardFilters,
} from './dashboard-filters';

describe('dashboard filters', () => {
  it('parses valid query params', () => {
    const parsed = parseDashboardFilters({
      formId: 'form-1',
      from: '2026-01-01',
      to: '2026-02-01',
      granularity: 'week',
      questionId: 'q-2',
    });

    expect(parsed.formId).toBe('form-1');
    expect(parsed.from).toBe('2026-01-01');
    expect(parsed.to).toBe('2026-02-01');
    expect(parsed.granularity).toBe('week');
    expect(parsed.questionId).toBe('q-2');
  });

  it('falls back to defaults on invalid params', () => {
    const defaults = defaultDashboardFilters();
    const parsed = parseDashboardFilters({
      from: 'bad-date',
      to: 'also-bad',
      granularity: 'hour',
    });

    expect(parsed.from).toBe(defaults.from);
    expect(parsed.to).toBe(defaults.to);
    expect(parsed.granularity).toBe('day');
  });

  it('serializes filters into query params', () => {
    const params = buildDashboardQueryParams({
      formId: 'f-9',
      from: '2026-03-01',
      to: '2026-03-20',
      granularity: 'month',
      questionId: 'q-1',
    });

    expect(params['formId']).toBe('f-9');
    expect(params['granularity']).toBe('month');
    expect(params['questionId']).toBe('q-1');
  });
});
