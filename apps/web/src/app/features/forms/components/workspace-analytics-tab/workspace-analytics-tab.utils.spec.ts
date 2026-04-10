import { describe, expect, it } from 'vitest';

import {
  hasScaleChartData,
  hasSelectChartData,
  optionKeysSorted,
  scaleDistributionEntriesSorted,
  selectChartSeriesSorted,
} from './workspace-analytics-tab.utils';

describe('workspace analytics utils', () => {
  it('sorts option keys by count descending then label', () => {
    const sorted = optionKeysSorted({
      Beta: 2,
      Alpha: 2,
      Gamma: 5,
    });

    expect(sorted).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('detects scale chart data only when counts are positive', () => {
    expect(
      hasScaleChartData({
        questionId: 'q1',
        questionTitle: 'Scale',
        questionType: 'rating',
        answerCount: 0,
        skippedCount: 0,
      }),
    ).toBe(false);

    expect(
      hasScaleChartData({
        questionId: 'q1',
        questionTitle: 'Scale',
        questionType: 'rating',
        answerCount: 1,
        skippedCount: 0,
        scaleAnalytics: {
          distribution: { '1': 0, '2': 3 },
          stats: { mean: 2, median: 2, min: 1, max: 2, standardDeviation: 0.5 },
        },
      }),
    ).toBe(true);
  });

  it('detects select chart data only when option counts are positive', () => {
    expect(
      hasSelectChartData({
        questionId: 'q2',
        questionTitle: 'Choice',
        questionType: 'single_choice',
        answerCount: 2,
        skippedCount: 1,
        selectAnalytics: {
          isMultiChoice: false,
          optionCounts: { Yes: 0, No: 0 },
          optionPercentages: { Yes: 0, No: 0 },
          mostPopular: [],
          totalSelections: 0,
        },
      }),
    ).toBe(false);

    expect(
      hasSelectChartData({
        questionId: 'q2',
        questionTitle: 'Choice',
        questionType: 'single_choice',
        answerCount: 2,
        skippedCount: 1,
        selectAnalytics: {
          isMultiChoice: false,
          optionCounts: { Yes: 2, No: 0 },
          optionPercentages: { Yes: 100, No: 0 },
          mostPopular: ['Yes'],
          totalSelections: 2,
        },
      }),
    ).toBe(true);
  });

  it('sorts scale distribution entries numerically first, then lexically', () => {
    const sorted = scaleDistributionEntriesSorted({
      '10': 2,
      '2': 1,
      N_A: 4,
      '1': 3,
    });

    expect(sorted).toEqual([
      ['1', 3],
      ['2', 1],
      ['10', 2],
      ['N_A', 4],
    ]);
  });

  it('builds select chart series sorted by breakdown order', () => {
    const series = selectChartSeriesSorted({
      Maybe: 1,
      Yes: 4,
      No: 4,
    });

    expect(series.labels).toEqual(['No', 'Yes', 'Maybe']);
    expect(series.values).toEqual([4, 4, 1]);
  });
});
