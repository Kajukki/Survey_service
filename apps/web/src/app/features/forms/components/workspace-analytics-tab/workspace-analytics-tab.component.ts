import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

import {
  FormAnalyticsQuestionRecordV2,
  FormAnalyticsReportRecord,
} from '../../../../shared/models/domain.models';
import {
  hasScaleChartData,
  hasSelectChartData,
  optionKeysSorted,
  scaleDistributionEntriesSorted,
  selectChartSeriesSorted,
} from './workspace-analytics-tab.utils';

Chart.register(...registerables);

@Component({
  selector: 'app-workspace-analytics-tab',
  standalone: true,
  templateUrl: './workspace-analytics-tab.component.html',
  styleUrl: './workspace-analytics-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceAnalyticsTabComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = input.required<boolean>();
  readonly hasError = input.required<boolean>();
  readonly hasAnalyticsResponses = input.required<boolean>();
  readonly analyticsReport = input.required<FormAnalyticsReportRecord | null>();
  readonly analyticsFreshness = input<string | undefined>();

  readonly scaleQuestions = input.required<FormAnalyticsQuestionRecordV2[]>();
  readonly selectQuestions = input.required<FormAnalyticsQuestionRecordV2[]>();
  readonly textQuestions = input.required<FormAnalyticsQuestionRecordV2[]>();
  readonly retry = output<void>();
  readonly expandedText = signal<Set<string>>(new Set());

  readonly scaleCanvases = viewChildren<ElementRef<HTMLCanvasElement>>('scaleCanvas');
  readonly selectCanvases = viewChildren<ElementRef<HTMLCanvasElement>>('selectCanvas');

  private charts: Chart[] = [];

  readonly optionKeysSorted = optionKeysSorted;
  readonly hasScaleChartData = hasScaleChartData;
  readonly hasSelectChartData = hasSelectChartData;

  constructor() {
    effect(() => {
      const scaleElements = this.scaleCanvases();
      const selectElements = this.selectCanvases();
      const scaleQuestions = this.scaleQuestions();
      const selectQuestions = this.selectQuestions();
      const canRender = this.hasAnalyticsResponses() && !this.isLoading() && !this.hasError();

      this.destroyCharts();

      if (!canRender) {
        return;
      }

      scaleElements.forEach((ref, index) => {
        const question = scaleQuestions[index];
        if (question?.scaleAnalytics && this.hasScaleChartData(question)) {
          this.charts.push(this.createScaleChart(ref.nativeElement, question));
        }
      });

      selectElements.forEach((ref, index) => {
        const question = selectQuestions[index];
        if (question?.selectAnalytics && this.hasSelectChartData(question)) {
          this.charts.push(this.createSelectChart(ref.nativeElement, question));
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.destroyCharts();
    });
  }

  formatNum(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  formatDate(value?: string): string {
    if (!value) {
      return '—';
    }

    return new Date(value).toLocaleString('en-FI', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  responseRate(question: FormAnalyticsQuestionRecordV2): number {
    const total = question.answerCount + question.skippedCount;
    if (total === 0) {
      return 0;
    }

    return Math.round((question.answerCount / total) * 100);
  }

  objectKeys(input: Record<string, number>): string[] {
    return Object.keys(input);
  }

  toggleTextExpand(questionId: string): void {
    this.expandedText.update((current) => {
      const next = new Set(current);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  private getChartColors(): {
    text: string;
    muted: string;
    border: string;
    accent: string;
    info: string;
    warn: string;
    ok: string;
    danger: string;
  } {
    const style = getComputedStyle(document.documentElement);
    return {
      text: style.getPropertyValue('--text-body').trim() || '#e2e8f0',
      muted: style.getPropertyValue('--text-subtle').trim() || '#718096',
      border: style.getPropertyValue('--line-default').trim() || '#2d3748',
      accent: style.getPropertyValue('--accent').trim() || '#667eea',
      info: style.getPropertyValue('--info').trim() || '#4299e1',
      warn: style.getPropertyValue('--warn').trim() || '#f6c90e',
      ok: style.getPropertyValue('--ok').trim() || '#48bb78',
      danger: style.getPropertyValue('--danger').trim() || '#fc8181',
    };
  }

  private createScaleChart(
    canvas: HTMLCanvasElement,
    question: FormAnalyticsQuestionRecordV2,
  ): Chart {
    const scale = question.scaleAnalytics!;
    const colors = this.getChartColors();

    const sortedEntries = scaleDistributionEntriesSorted(scale.distribution);
    const labels = sortedEntries.map(([label]) => label);
    const values = sortedEntries.map(([, count]) => count);

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: 'Responses',
            backgroundColor: colors.accent + 'b3',
            borderColor: colors.accent,
            borderWidth: 1,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827',
            titleColor: '#f9fafb',
            bodyColor: '#d1d5db',
            borderColor: colors.border,
            borderWidth: 1,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ` Responses: ${ctx.raw}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: colors.muted },
            grid: { color: colors.border + '40' },
            title: {
              display: true,
              text: 'Scale Value',
              color: colors.muted,
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: colors.muted,
              precision: 0,
            },
            grid: { color: colors.border + '40' },
            title: {
              display: true,
              text: 'Responses',
              color: colors.muted,
            },
          },
        },
      },
    };

    return new Chart(canvas, config);
  }

  private createSelectChart(
    canvas: HTMLCanvasElement,
    question: FormAnalyticsQuestionRecordV2,
  ): Chart {
    const select = question.selectAnalytics!;
    const { labels, values } = selectChartSeriesSorted(select.optionCounts);
    const palette = this.generatePalette(labels.length);
    const colors = this.getChartColors();

    const config: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: palette.map((color) => color + 'cc'),
            borderColor: palette,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827',
            titleColor: '#f9fafb',
            bodyColor: '#d1d5db',
            borderColor: colors.border,
            borderWidth: 1,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => {
                const label = ctx.label || 'Option';
                const value = Number(ctx.raw ?? 0);
                const percentage = select.optionPercentages[label] ?? 0;
                return ` ${label}: ${value} (${percentage}%)`;
              },
            },
          },
        },
      },
    };

    return new Chart(canvas, config);
  }

  private generatePalette(count: number): string[] {
    const colors = this.getChartColors();
    const basePalette = [
      colors.accent,
      colors.info,
      colors.ok,
      colors.warn,
      colors.danger,
      '#a78bfa',
      '#f472b6',
      '#22d3ee',
      '#fb923c',
      '#4ade80',
    ];

    return Array.from({ length: count }, (_, index) => basePalette[index % basePalette.length]);
  }

  private destroyCharts(): void {
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];
  }
}
