import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { ApiSuccessEnvelope, emptyEnvelope } from '../../core/api/api-envelope';
import { API_BASE_URL } from '../../core/api/api-config.token';
import { FormDto, mapForms } from '../../core/api/survey-api.adapters';
import { FormRecord } from '../../shared/models/domain.models';

@Component({
  selector: 'app-forms-page',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <section class="card page">
      <header class="header">
        <div>
          <h2>Forms</h2>
          <p>Owned and shared forms available for analysis.</p>
        </div>
        <button type="button" class="btn-primary" (click)="nextPage()">Next page</button>
      </header>

      @if (forms.isLoading()) {
        <p>Loading forms...</p>
      } @else if (forms.error()) {
        <p class="error">Unable to load forms.</p>
      } @else {
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Owner</th>
              <th>Visibility</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (form of formItems(); track form.id) {
              <tr>
                <td>{{ form.title }}</td>
                <td>{{ form.owner }}</td>
                <td>
                  <span class="badge">{{ form.visibility }}</span>
                </td>
                <td>{{ form.updatedAt | date: 'mediumDate' }}</td>
                <td class="actions">
                  <a class="btn-secondary" [routerLink]="['/forms', form.id]">Open workspace</a>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5">No forms found.</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styleUrl: './forms.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormsPageComponent {
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly page = signal(1);

  protected readonly forms = httpResource<ApiSuccessEnvelope<FormDto[]>>(
    () => `${this.apiBaseUrl}/forms?page=${this.page()}&perPage=20`,
    {
      defaultValue: emptyEnvelope<FormDto[]>([]),
    },
  );

  protected readonly formItems = computed<FormRecord[]>(() =>
    mapForms(this.forms.value()?.data ?? []),
  );

  protected nextPage(): void {
    this.page.update((value) => value + 1);
  }
}
