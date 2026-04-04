import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { DashboardKpi } from '../../../../shared/models/domain.models';

@Component({
  selector: 'app-dashboard-kpi-row',
  standalone: true,
  templateUrl: './dashboard-kpi-row.component.html',
  styleUrl: './dashboard-kpi-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardKpiRowComponent {
  readonly kpis = input.required<DashboardKpi[]>();
  readonly loading = input<boolean>(false);
}
