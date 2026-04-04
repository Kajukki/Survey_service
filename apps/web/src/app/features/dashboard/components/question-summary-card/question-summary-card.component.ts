import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { QuestionSummary } from '../../../../shared/models/domain.models';

@Component({
  selector: 'app-question-summary-card',
  standalone: true,
  templateUrl: './question-summary-card.component.html',
  styleUrl: './question-summary-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionSummaryCardComponent {
  readonly question = input.required<QuestionSummary>();
}
