import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FormStructureRecord } from '../../../../shared/models/domain.models';

@Component({
  selector: 'app-workspace-overview-tab',
  standalone: true,
  templateUrl: './workspace-overview-tab.component.html',
  styleUrl: './workspace-overview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceOverviewTabComponent {
  readonly structure = input.required<FormStructureRecord>();
}
