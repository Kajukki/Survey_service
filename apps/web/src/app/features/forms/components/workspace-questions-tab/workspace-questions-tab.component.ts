import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { FormSectionRecord } from '../../../../shared/models/domain.models';
import { FormsWorkspaceState } from '../../data/forms-workspace-state';

@Component({
  selector: 'app-workspace-questions-tab',
  standalone: true,
  templateUrl: './workspace-questions-tab.component.html',
  styleUrl: './workspace-questions-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceQuestionsTabComponent {
  readonly workspaceState = input.required<FormsWorkspaceState>();
  readonly filteredSections = input.required<FormSectionRecord[]>();

  readonly searchChanged = output<string>();
  readonly questionTypeChanged = output<string>();
}
