import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';

import { API_BASE_URL } from '../../core/api/api-config.token';
import { SharingRecord } from '../../shared/models/domain.models';

@Component({
  selector: 'app-sharing-page',
  standalone: true,
  template: `
    <section class="card page">
      <header>
        <h2>Sharing</h2>
        <p>Review and manage resource grants.</p>
      </header>

      @if (grants.isLoading()) {
        <p>Loading grants...</p>
      } @else if (grants.error()) {
        <p class="error">Could not load sharing information.</p>
      } @else {
        <table>
          <thead>
            <tr>
              <th>Resource</th>
              <th>Principal</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            @for (grant of grants.value(); track grant.id) {
              <tr>
                <td>{{ grant.resource }}</td>
                <td>{{ grant.principal }}</td>
                <td>{{ grant.role }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="3">No grants found.</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styleUrl: './sharing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharingPageComponent {
  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly grants = httpResource<SharingRecord[]>(
    () => `${this.apiBaseUrl}/sharing?limit=30`,
    {
      defaultValue: [],
    },
  );
}
