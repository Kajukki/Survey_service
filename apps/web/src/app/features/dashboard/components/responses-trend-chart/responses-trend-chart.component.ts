import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { DashboardSeriesPoint } from '../../../../shared/models/domain.models';

@Component({
  selector: 'app-responses-trend-chart',
  standalone: true,
  templateUrl: './responses-trend-chart.component.html',
  styleUrl: './responses-trend-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponsesTrendChartComponent {
  readonly data = input.required<DashboardSeriesPoint[]>();

  protected readonly maxValue = computed(() => Math.max(...this.data().map((point) => point.count), 1));

  protected readonly summary = computed(() => {
    const points = this.data();
    if (points.length === 0) {
      return 'No series data available for the selected range.';
    }

    const total = points.reduce((sum, point) => sum + point.count, 0);
    return `${total} total responses across ${points.length} intervals.`;
  });

  protected barHeight(value: number): number {
    return Math.max((value / this.maxValue()) * 100, 4);
  }
}
