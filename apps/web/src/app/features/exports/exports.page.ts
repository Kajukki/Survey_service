import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';

import { ApiSuccessEnvelope, emptyEnvelope } from '../../core/api/api-envelope';
import { API_BASE_URL } from '../../core/api/api-config.token';
import { ExportDto, mapExports } from '../../core/api/survey-api.adapters';
import { ExportRecord } from '../../shared/models/domain.models';

@Component({
  selector: 'app-exports-page',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="card page">
      <header class="page-header">
        <h2>Exports</h2>
        <p>CSV and Excel export requests and delivery status.</p>
      </header>

      @if (exportsResource.isLoading()) {
        <p class="empty-state">Loading exports...</p>
      } @else if (exportsResource.error()) {
        <p class="error">Unable to fetch export history.</p>
      } @else {
        <ul class="surface-list">
          @for (exportItem of exportItems(); track exportItem.id) {
            <li class="surface-list-item export-item" [class]="exportItemClass(exportItem.status)">
              <span class="export-format">{{ exportItem.format }}</span>
              <strong class="status-badge" [class]="exportBadgeClass(exportItem.status)">
                <span class="status-badge__dot" aria-hidden="true"></span>
                {{ exportItem.status }}
              </strong>
              <span class="surface-list-item__time">{{ exportItem.requestedAt | date: 'short' }}</span>
            </li>
          } @empty {
            <li class="surface-list-item empty-state">No exports created yet.</li>
          }
        </ul>
      }
    </section>
  `,
  styleUrl: './exports.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportsPageComponent {
  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly exportsResource = httpResource<ApiSuccessEnvelope<ExportDto[]>>(
    () => `${this.apiBaseUrl}/exports?perPage=20`,
    {
      defaultValue: emptyEnvelope<ExportDto[]>([]),
    },
  );

  protected readonly exportItems = computed<ExportRecord[]>(() =>
    mapExports(this.exportsResource.value()?.data ?? []),
  );

  protected exportBadgeClass(status: string): string {
    return `status-badge status-badge--${this.toStatusTone(status)}`;
  }

  protected exportItemClass(status: string): string {
    return `surface-list-item export-item surface-list-item--${this.toStatusTone(status)}`;
  }

  private toStatusTone(status: string): 'result' | 'queued' | 'error' | 'connected' {
    const normalized = status.toLowerCase();
    if (normalized.includes('done') || normalized.includes('ready') || normalized.includes('completed')) {
      return 'result';
    }

    if (normalized.includes('pending') || normalized.includes('queue') || normalized.includes('running')) {
      return 'queued';
    }

    if (normalized.includes('error') || normalized.includes('failed')) {
      return 'error';
    }

    return 'connected';
  }
}
