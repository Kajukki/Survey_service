import { FormAnalyticsQuestionRecordV2 } from '../../../../shared/models/domain.models';

export function optionKeysSorted(input: Record<string, number>): string[] {
  return Object.entries(input)
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }

      return a[0].localeCompare(b[0]);
    })
    .map(([label]) => label);
}

export function hasScaleChartData(question: FormAnalyticsQuestionRecordV2): boolean {
  const distribution = question.scaleAnalytics?.distribution;
  if (!distribution) {
    return false;
  }

  return Object.values(distribution).some((value) => value > 0);
}

export function hasSelectChartData(question: FormAnalyticsQuestionRecordV2): boolean {
  const optionCounts = question.selectAnalytics?.optionCounts;
  if (!optionCounts) {
    return false;
  }

  return Object.values(optionCounts).some((value) => value > 0);
}

export function scaleDistributionEntriesSorted(
  distribution: Record<string, number>,
): Array<[string, number]> {
  return Object.entries(distribution).sort((a, b) => {
    const aNumeric = Number(a[0]);
    const bNumeric = Number(b[0]);
    const aIsNumeric = Number.isFinite(aNumeric);
    const bIsNumeric = Number.isFinite(bNumeric);

    if (aIsNumeric && bIsNumeric && aNumeric !== bNumeric) {
      return aNumeric - bNumeric;
    }

    if (aIsNumeric !== bIsNumeric) {
      return aIsNumeric ? -1 : 1;
    }

    return a[0].localeCompare(b[0]);
  });
}
