import { describe, expect, it } from 'vitest';
import { computeNumericStats } from './stats.js';

describe('computeNumericStats', () => {
  it('returns null for empty values', () => {
    expect(computeNumericStats([])).toBeNull();
  });

  it('computes stats for odd-length values', () => {
    expect(computeNumericStats([1, 2, 3, 4, 5])).toEqual({
      mean: 3,
      median: 3,
      min: 1,
      max: 5,
      standardDeviation: 1.41,
    });
  });

  it('computes stats for even-length values', () => {
    expect(computeNumericStats([1, 2, 4, 10])).toEqual({
      mean: 4.25,
      median: 3,
      min: 1,
      max: 10,
      standardDeviation: 3.49,
    });
  });
});
