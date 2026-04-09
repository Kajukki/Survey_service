export type NumericStats = {
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number;
};

export function computeNumericStats(values: number[]): NumericStats | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sum = values.reduce((total, value) => total + value, 0);
  const mean = sum / values.length;
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
      : sorted[Math.floor(sorted.length / 2)]!;
  const variance =
    values.reduce((total, value) => total + (value - mean) * (value - mean), 0) / values.length;

  return {
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    standardDeviation: Number(Math.sqrt(variance).toFixed(2)),
  };
}
