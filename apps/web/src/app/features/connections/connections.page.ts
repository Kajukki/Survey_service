import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';

import { ApiSuccessEnvelope, emptyEnvelope } from '../../core/api/api-envelope';
import { API_BASE_URL } from '../../core/api/api-config.token';
import { ConnectionDto, mapConnections } from '../../core/api/survey-api.adapters';
import { Connection } from '../../shared/models/domain.models';

@Component({
  selector: 'app-connections-page',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="card page">
      <header>
        <h2>Connections</h2>
        <p>Manage Google and Microsoft connectors for sync jobs.</p>
      </header>

      @if (connections.isLoading()) {
        <p>Loading connections...</p>
      } @else if (connections.error()) {
        <p class="error">Could not load connectors. Try refresh.</p>
      } @else {
        <ul>
          @for (connection of connectionItems(); track connection.id) {
            <li>
              <strong>{{ connection.provider }}</strong>
              <span>{{ connection.status }}</span>
              <span>{{ connection.updatedAt | date: 'mediumDate' }}</span>
            </li>
          } @empty {
            <li>No connector configured yet.</li>
          }
        </ul>
      }
    </section>
  `,
  styleUrl: './connections.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionsPageComponent {
  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly connections = httpResource<ApiSuccessEnvelope<ConnectionDto[]>>(
    () => `${this.apiBaseUrl}/connections`,
    {
      defaultValue: emptyEnvelope<ConnectionDto[]>([]),
    },
  );

  protected readonly connectionItems = computed<Connection[]>(() =>
    mapConnections(this.connections.value()?.data ?? []),
  );
}
