import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DashboardFilters, FormRecord, Granularity } from '../../../../shared/models/domain.models';

@Component({
  selector: 'app-dashboard-filter-bar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './dashboard-filter-bar.component.html',
  styleUrl: './dashboard-filter-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardFilterBarComponent {
  readonly filters = input.required<DashboardFilters>();
  readonly forms = input.required<FormRecord[]>();

  readonly filtersChange = output<DashboardFilters>();

  protected readonly formId = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly granularity = signal<Granularity>('day');

  constructor() {
    effect(() => {
      const current = this.filters();
      this.formId.set(current.formId);
      this.from.set(current.from);
      this.to.set(current.to);
      this.granularity.set(current.granularity);
    });
  }

  protected apply(): void {
    this.filtersChange.emit({
      ...this.filters(),
      formId: this.formId(),
      from: this.from(),
      to: this.to(),
      granularity: this.granularity(),
    });
  }
}
