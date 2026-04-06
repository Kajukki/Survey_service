import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { ApiSuccessEnvelope, emptyEnvelope } from '../../../core/api/api-envelope';
import { API_BASE_URL } from '../../../core/api/api-config.token';
import { FormDto, mapForms } from '../../../core/api/survey-api.adapters';
import {
  DashboardPayload,
  DashboardFilters,
  FormRecord,
} from '../../../shared/models/domain.models';
import { buildDashboardQueryParams, parseDashboardFilters } from '../data/dashboard-filters';
import { DashboardFilterBarComponent } from '../components/dashboard-filter-bar/dashboard-filter-bar.component';
import { DashboardKpiRowComponent } from '../components/dashboard-kpi-row/dashboard-kpi-row.component';
import { ResponsesTrendChartComponent } from '../components/responses-trend-chart/responses-trend-chart.component';
import { QuestionSummaryCardComponent } from '../components/question-summary-card/question-summary-card.component';
import { ResponsesBreakdownTableComponent } from '../components/responses-breakdown-table/responses-breakdown-table.component';

const EMPTY_DASHBOARD: DashboardPayload = {
  kpis: [],
  series: [],
  questions: [],
};

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    DashboardFilterBarComponent,
    DashboardKpiRowComponent,
    ResponsesTrendChartComponent,
    QuestionSummaryCardComponent,
    ResponsesBreakdownTableComponent,
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly queryParams = toSignal(this.route.queryParams, {
    initialValue: this.route.snapshot.queryParams,
  });

  protected readonly filters = computed(() => parseDashboardFilters(this.queryParams()));

  protected readonly formsResource = httpResource<ApiSuccessEnvelope<FormDto[]>>(
    () => `${this.apiBaseUrl}/forms?perPage=200`,
    {
      defaultValue: emptyEnvelope<FormDto[]>([]),
    },
  );

  protected readonly forms = computed<FormRecord[]>(() =>
    mapForms(this.formsResource.value()?.data ?? []),
  );

  protected readonly dashboardResource = httpResource<DashboardPayload>(
    () => this.buildDashboardEndpoint(this.filters()),
    {
      defaultValue: EMPTY_DASHBOARD,
    },
  );

  protected readonly questionHighlights = computed(
    () => this.dashboardResource.value()?.questions?.slice(0, 6) ?? [],
  );

  protected onFiltersChange(filters: DashboardFilters): void {
    const params = buildDashboardQueryParams(filters);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }

  protected refresh(): void {
    this.formsResource.reload();
    this.dashboardResource.reload();
  }

  private buildDashboardEndpoint(filters: DashboardFilters): string | undefined {
    if (!filters.formId) {
      return undefined;
    }

    const params = new URLSearchParams({
      formId: filters.formId,
      from: filters.from,
      to: filters.to,
      granularity: filters.granularity,
    });

    if (filters.questionId) {
      params.set('questionId', filters.questionId);
    }

    return `${this.apiBaseUrl}/dashboard?${params.toString()}`;
  }
}
