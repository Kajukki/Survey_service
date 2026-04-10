import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { FormResponseSummaryRecord } from '../../../../shared/models/domain.models';
import { FormsWorkspaceState } from '../../data/forms-workspace-state';

@Component({
  selector: 'app-workspace-responses-tab',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './workspace-responses-tab.component.html',
  styleUrl: './workspace-responses-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceResponsesTabComponent {
  readonly workspaceState = input.required<FormsWorkspaceState>();
  readonly questionOptions = input.required<Array<{ id: string; label: string }>>();
  readonly responses = input.required<FormResponseSummaryRecord[]>();

  readonly responsePage = input.required<number>();
  readonly responsePerPage = input.required<number>();
  readonly responseTotal = input.required<number>();
  readonly responseTotalPages = input.required<number>();
  readonly canPreviousResponsesPage = input.required<boolean>();
  readonly canNextResponsesPage = input.required<boolean>();
  readonly responseFiltersActive = input.required<boolean>();
  readonly isLoading = input.required<boolean>();
  readonly hasError = input.required<boolean>();

  readonly responsesSearchChanged = output<string>();
  readonly responsesQuestionIdChanged = output<string>();
  readonly responsesCompletionChanged = output<string>();
  readonly responsesPerPageChanged = output<string>();
  readonly previousPage = output<void>();
  readonly nextPage = output<void>();
  readonly resetFilters = output<void>();
  readonly retry = output<void>();
}
