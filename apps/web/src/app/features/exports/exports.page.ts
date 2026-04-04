import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';

import { API_BASE_URL } from '../../core/api/api-config.token';
import { ExportRecord } from '../../shared/models/domain.models';

@Component({
  selector: 'app-exports-page',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="card page">
      <header>
        <h2>Exports</h2>
        <p>CSV and Excel export requests and delivery status.</p>
      </header>

      @if (exportsResource.isLoading()) {
        <p>Loading exports...</p>
      } @else if (exportsResource.error()) {
        <p class="error">Unable to fetch export history.</p>
      } @else {
        <ul>
          @for (exportItem of exportsResource.value(); track exportItem.id) {
            <li>
              <span>{{ exportItem.format }}</span>
              <strong>{{ exportItem.status }}</strong>
              <span>{{ exportItem.requestedAt | date: 'short' }}</span>
            </li>
          } @empty {
            <li>No exports created yet.</li>
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

  protected readonly exportsResource = httpResource<ExportRecord[]>(
    () => `${this.apiBaseUrl}/exports?limit=20`,
    {
      defaultValue: [],
    },
  );
}
