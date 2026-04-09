import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource, HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';

import { ApiSuccessEnvelope, emptyEnvelope } from '../../core/api/api-envelope';
import { API_BASE_URL } from '../../core/api/api-config.token';
import { ConnectionDto, JobDto, mapJobs } from '../../core/api/survey-api.adapters';
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
          @if (!selectedConnectionId()) {
            <p class="empty-state">Connect a Google account to run sync jobs.</p>
          }
        </div>
        <button
          type="button"
          class="btn-primary"
          [disabled]="!selectedConnectionId()"
          (click)="triggerManualSync()"
        >
          Run sync
        </button>
      </header>

      @if (jobs.isLoading()) {
        <p class="empty-state">Loading jobs...</p>
      } @else if (jobs.error()) {
        <p class="error">Could not load jobs right now.</p>
      } @else {
        <ul class="surface-list">
          @for (job of jobItems(); track job.id) {
            <li class="surface-list-item job-item" [class]="jobItemClass(job.status)">
              <span class="job-source">{{ job.source }}</span>
              <strong class="status-badge" [class]="jobBadgeClass(job.status)">
                <span class="status-badge__dot" aria-hidden="true"></span>
                {{ job.status }}
              </strong>
              <span class="surface-list-item__time">{{ job.createdAt | date: 'short' }}</span>
            </li>
          } @empty {
            <li class="surface-list-item empty-state">No sync jobs yet.</li>
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

  protected readonly jobs = httpResource<ApiSuccessEnvelope<JobDto[]>>(
    () => `${this.apiBaseUrl}/jobs?perPage=20`,
    {
      defaultValue: emptyEnvelope<JobDto[]>([]),
    },
  );

  protected readonly connections = httpResource<ApiSuccessEnvelope<ConnectionDto[]>>(
    () => `${this.apiBaseUrl}/connections?perPage=20`,
    {
      defaultValue: emptyEnvelope<ConnectionDto[]>([]),
    },
  );

  protected readonly jobItems = computed<SyncJob[]>(() => mapJobs(this.jobs.value()?.data ?? []));
  protected readonly selectedConnectionId = computed<string | null>(() => {
    const googleConnection = (this.connections.value()?.data ?? []).find(
      (connection) => connection.type === 'google',
    );

    return googleConnection?.id ?? null;
  });

  protected triggerManualSync(): void {
    const connectionId = this.selectedConnectionId();
    if (!connectionId) {
      return;
    }

    this.http.post(`${this.apiBaseUrl}/jobs/sync`, { connectionId }).subscribe({
      next: () => this.jobs.reload(),
      error: () => {
        // no-op, error handling is centralized in interceptor
      },
    });
  }

  protected jobBadgeClass(status: string): string {
    return `status-badge status-badge--${this.toStatusTone(status)}`;
  }

  protected jobItemClass(status: string): string {
    return `surface-list-item job-item surface-list-item--${this.toStatusTone(status)}`;
  }

  private toStatusTone(status: string): 'result' | 'queued' | 'error' | 'connected' {
    const normalized = status.toLowerCase();
    if (
      normalized.includes('success') ||
      normalized.includes('done') ||
      normalized.includes('completed')
    ) {
      return 'result';
    }

    if (
      normalized.includes('pending') ||
      normalized.includes('queue') ||
      normalized.includes('running')
    ) {
      return 'queued';
    }

    if (normalized.includes('error') || normalized.includes('failed')) {
      return 'error';
    }

    return 'connected';
  }
}
