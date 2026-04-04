import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { httpResource, HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';

import { API_BASE_URL } from '../../core/api/api-config.token';
import { SyncJob } from '../../shared/models/domain.models';

@Component({
  selector: 'app-sync-jobs-page',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="card page">
      <header class="header">
        <div>
          <h2>Sync jobs</h2>
          <p>Track and trigger ingestion jobs.</p>
        </div>
        <button type="button" (click)="triggerManualSync()">Run sync</button>
      </header>

      @if (jobs.isLoading()) {
        <p>Loading jobs...</p>
      } @else if (jobs.error()) {
        <p class="error">Could not load jobs right now.</p>
      } @else {
        <ul>
          @for (job of jobs.value(); track job.id) {
            <li>
              <span>{{ job.source }}</span>
              <strong>{{ job.status }}</strong>
              <span>{{ job.createdAt | date: 'short' }}</span>
            </li>
          } @empty {
            <li>No sync jobs yet.</li>
          }
        </ul>
      }
    </section>
  `,
  styleUrl: './sync-jobs.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncJobsPageComponent {
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);

  protected readonly jobs = httpResource<SyncJob[]>(() => `${this.apiBaseUrl}/sync-jobs?limit=20`, {
    defaultValue: [],
  });

  protected triggerManualSync(): void {
    this.http.post(`${this.apiBaseUrl}/sync-jobs`, {}).subscribe({
      next: () => this.jobs.reload(),
      error: () => {
        // no-op, error handling is centralized in interceptor
      },
    });
  }
}
