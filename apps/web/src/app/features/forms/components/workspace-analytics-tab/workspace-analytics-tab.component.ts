import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import {
  FormAnalyticsQuestionRecordV2,
  FormAnalyticsReportRecord,
} from '../../../../shared/models/domain.models';

@Component({
  selector: 'app-workspace-analytics-tab',
  standalone: true,
  templateUrl: './workspace-analytics-tab.component.html',
  styleUrl: './workspace-analytics-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceAnalyticsTabComponent {
  readonly isLoading = input.required<boolean>();
  readonly hasError = input.required<boolean>();
  readonly hasAnalyticsResponses = input.required<boolean>();
  readonly analyticsReport = input.required<FormAnalyticsReportRecord | null>();
  readonly analyticsFreshness = input<string | undefined>();

  readonly scaleQuestions = input.required<FormAnalyticsQuestionRecordV2[]>();
  readonly selectQuestions = input.required<FormAnalyticsQuestionRecordV2[]>();
  readonly textQuestions = input.required<FormAnalyticsQuestionRecordV2[]>();
  readonly retry = output<void>();

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

  objectKeys(input: Record<string, number>): string[] {
    return Object.keys(input);
  }

  responseRate(question: FormAnalyticsQuestionRecordV2): number {
    const total = question.answerCount + question.skippedCount;
    if (total === 0) {
      return 0;
    }

    return Math.round((question.answerCount / total) * 100);
  }
}
