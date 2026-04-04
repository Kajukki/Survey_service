import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { QuestionSummary } from '../../../../shared/models/domain.models';

@Component({
  selector: 'app-responses-breakdown-table',
  standalone: true,
  templateUrl: './responses-breakdown-table.component.html',
  styleUrl: './responses-breakdown-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponsesBreakdownTableComponent {
  readonly questions = input.required<QuestionSummary[]>();
}
