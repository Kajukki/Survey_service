import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { API_BASE_URL } from '../../core/api/api-config.token';
import { ApiSuccessEnvelope } from '../../core/api/api-envelope';
import {
  FormAnalyticsSegmentsDto,
  FormAnalyticsOverviewDto,
  FormAnalyticsQuestionsDto,
  FormResponsesListDto,
  FormStructureDto,
  mapFormAnalyticsSegments,
  mapFormAnalyticsOverview,
  mapFormAnalyticsQuestions,
  mapFormResponses,
  mapFormStructure,
} from '../../core/api/survey-api.adapters';
import {
  FormAnalyticsSegmentsRecord,
  FormAnalyticsOverviewRecord,
  FormAnalyticsQuestionsRecord,
  FormResponseSummaryRecord,
  FormSectionRecord,
  FormStructureRecord,
} from '../../shared/models/domain.models';
import {
  FormsWorkspaceTab,
  buildFormsWorkspaceQueryParams,
  parseFormsWorkspaceState,
} from './data/forms-workspace-state';

@Component({
  selector: 'app-form-workspace-page',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './form-workspace.page.html',
  styleUrl: './form-workspace.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormWorkspacePageComponent {
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly queryParams = toSignal(this.route.queryParams, {
    initialValue: this.route.snapshot.queryParams,
  });

  private readonly routeParams = toSignal(this.route.params, {
    initialValue: this.route.snapshot.params,
  });

  protected readonly workspaceState = computed(() => parseFormsWorkspaceState(this.queryParams()));
  protected readonly activeTab = computed(() => this.workspaceState().tab);

  protected readonly structureResource = httpResource<ApiSuccessEnvelope<FormStructureDto>>(() =>
    this.buildStructureEndpoint(),
  );

  protected readonly responsesResource = httpResource<ApiSuccessEnvelope<FormResponsesListDto>>(
    () => this.buildResponsesEndpoint(),
  );

  protected readonly analyticsOverviewResource = httpResource<
    ApiSuccessEnvelope<FormAnalyticsOverviewDto>
  >(() => this.buildAnalyticsOverviewEndpoint());

  protected readonly analyticsQuestionsResource = httpResource<
    ApiSuccessEnvelope<FormAnalyticsQuestionsDto>
  >(() => this.buildAnalyticsQuestionsEndpoint());

  protected readonly analyticsSegmentsResource = httpResource<
    ApiSuccessEnvelope<FormAnalyticsSegmentsDto>
  >(() => this.buildAnalyticsSegmentsEndpoint());

  protected readonly structure = computed<FormStructureRecord | null>(() => {
    const dto = this.structureResource.value()?.data;
    return dto ? mapFormStructure(dto) : null;
  });

  protected readonly filteredSections = computed<FormSectionRecord[]>(() => {
    const structure = this.structure();
    if (!structure) {
      return [];
    }

    const search = this.workspaceState().questionSearch?.trim().toLowerCase();
    const typeFilter = this.workspaceState().questionType;

    return structure.sections
      .map((section) => ({
        ...section,
        questions: section.questions.filter((question) => {
          if (typeFilter && question.type !== typeFilter) {
            return false;
          }

          if (!search) {
            return true;
          }

          const haystack = `${question.label} ${question.description ?? ''}`.toLowerCase();
          return haystack.includes(search);
        }),
      }))
      .filter((section) => section.questions.length > 0);
  });

  protected readonly questionOptions = computed<Array<{ id: string; label: string }>>(() => {
    const structure = this.structure();
    if (!structure) {
      return [];
    }

    return structure.sections.flatMap((section) =>
      section.questions.map((question) => ({
        id: question.id,
        label: question.label,
      })),
    );
  });

  protected readonly responses = computed<FormResponseSummaryRecord[]>(() => {
    const dto = this.responsesResource.value()?.data;
    return dto ? mapFormResponses(dto) : [];
  });

  protected readonly analyticsOverview = computed<FormAnalyticsOverviewRecord | null>(() => {
    const dto = this.analyticsOverviewResource.value()?.data;
    return dto ? mapFormAnalyticsOverview(dto) : null;
  });

  protected readonly analyticsQuestions = computed<FormAnalyticsQuestionsRecord | null>(() => {
    const dto = this.analyticsQuestionsResource.value()?.data;
    return dto ? mapFormAnalyticsQuestions(dto) : null;
  });

  protected readonly analyticsSegments = computed<FormAnalyticsSegmentsRecord | null>(() => {
    const dto = this.analyticsSegmentsResource.value()?.data;
    return dto ? mapFormAnalyticsSegments(dto) : null;
  });

  protected readonly responsePage = computed(() => this.workspaceState().responsesPage);
  protected readonly responsePerPage = computed(() => this.workspaceState().responsesPerPage);
  protected readonly responseTotalPages = computed(
    () => this.responsesResource.value()?.meta?.pagination?.totalPages ?? 0,
  );
  protected readonly responseTotal = computed(
    () => this.responsesResource.value()?.meta?.pagination?.total ?? 0,
  );

  protected readonly canPreviousResponsesPage = computed(() => this.responsePage() > 1);
  protected readonly canNextResponsesPage = computed(() => {
    const totalPages = this.responseTotalPages();
    return totalPages > 0 && this.responsePage() < totalPages;
  });

  protected readonly isLoadingAny = computed(
    () =>
      this.structureResource.isLoading() ||
      this.responsesResource.isLoading() ||
      this.analyticsOverviewResource.isLoading() ||
      this.analyticsQuestionsResource.isLoading() ||
      this.analyticsSegmentsResource.isLoading(),
  );

  protected readonly analyticsFreshness = computed(() => this.analyticsOverview()?.dataFreshness ?? null);

  protected readonly responseFiltersActive = computed(() => {
    const state = this.workspaceState();
    return Boolean(state.responseSearch || state.responseQuestionId || state.completion);
  });

  protected readonly analyticsFiltersActive = computed(() => {
    const state = this.workspaceState();
    return Boolean(state.analyticsQuestionId || state.analyticsGranularity !== 'day' || state.analyticsSegmentBy !== 'completion');
  });

  protected selectTab(tab: FormsWorkspaceTab): void {
    this.updateWorkspaceState({ tab });
  }

  protected updateSearch(value: string): void {
    this.updateWorkspaceState({ questionSearch: value || undefined });
  }

  protected updateQuestionType(value: string): void {
    this.updateWorkspaceState({ questionType: value || undefined });
  }

  protected updateResponsesSearch(value: string): void {
    this.updateWorkspaceState({
      responseSearch: value || undefined,
      responsesPage: 1,
    });
  }

  protected updateResponsesQuestionId(value: string): void {
    this.updateWorkspaceState({
      responseQuestionId: value || undefined,
      responsesPage: 1,
    });
  }

  protected updateResponsesCompletion(value: string): void {
    this.updateWorkspaceState({
      completion: value === 'completed' || value === 'partial' ? value : undefined,
      responsesPage: 1,
    });
  }

  protected updateResponsesPerPage(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    this.updateWorkspaceState({
      responsesPerPage: Math.min(parsed, 100),
      responsesPage: 1,
    });
  }

  protected previousResponsesPage(): void {
    if (!this.canPreviousResponsesPage()) {
      return;
    }

    this.updateWorkspaceState({ responsesPage: this.responsePage() - 1 });
  }

  protected nextResponsesPage(): void {
    if (!this.canNextResponsesPage()) {
      return;
    }

    this.updateWorkspaceState({ responsesPage: this.responsePage() + 1 });
  }

  protected updateAnalyticsFrom(value: string): void {
    if (!value) {
      return;
    }

    this.updateWorkspaceState({ analyticsFrom: value });
  }

  protected updateAnalyticsTo(value: string): void {
    if (!value) {
      return;
    }

    this.updateWorkspaceState({ analyticsTo: value });
  }

  protected updateAnalyticsGranularity(value: string): void {
    if (value !== 'day' && value !== 'week' && value !== 'month') {
      return;
    }

    this.updateWorkspaceState({ analyticsGranularity: value });
  }

  protected updateAnalyticsQuestionId(value: string): void {
    this.updateWorkspaceState({ analyticsQuestionId: value || undefined });
  }

  protected updateAnalyticsSegmentBy(value: string): void {
    if (value !== 'completion' && value !== 'channel') {
      return;
    }

    this.updateWorkspaceState({ analyticsSegmentBy: value });
  }

  protected refresh(): void {
    this.structureResource.reload();
    this.responsesResource.reload();
    this.analyticsOverviewResource.reload();
    this.analyticsQuestionsResource.reload();
    this.analyticsSegmentsResource.reload();
  }

  protected resetResponsesFilters(): void {
    this.updateWorkspaceState({
      responseSearch: undefined,
      responseQuestionId: undefined,
      completion: undefined,
      responsesPage: 1,
    });
  }

  protected resetAnalyticsFilters(): void {
    const defaults = parseFormsWorkspaceState({});
    this.updateWorkspaceState({
      analyticsQuestionId: undefined,
      analyticsGranularity: defaults.analyticsGranularity,
      analyticsSegmentBy: defaults.analyticsSegmentBy,
      analyticsFrom: defaults.analyticsFrom,
      analyticsTo: defaults.analyticsTo,
    });
  }

  private buildStructureEndpoint(): string | undefined {
    const formId = this.routeParams()['id'];
    if (!formId || typeof formId !== 'string') {
      return undefined;
    }

    return `${this.apiBaseUrl}/forms/${formId}/structure`;
  }

  private buildResponsesEndpoint(): string | undefined {
    const formId = this.routeParams()['id'];
    if (!formId || typeof formId !== 'string') {
      return undefined;
    }

    const state = this.workspaceState();
    const searchParams = new URLSearchParams({
      page: String(state.responsesPage),
      perPage: String(state.responsesPerPage),
    });

    if (state.responseQuestionId) {
      searchParams.set('questionId', state.responseQuestionId);
    }

    if (state.responseSearch) {
      searchParams.set('answerContains', state.responseSearch);
    }

    if (state.completion) {
      searchParams.set('completion', state.completion);
    }

    return `${this.apiBaseUrl}/forms/${formId}/responses?${searchParams.toString()}`;
  }

  private buildAnalyticsOverviewEndpoint(): string | undefined {
    const formId = this.routeParams()['id'];
    if (!formId || typeof formId !== 'string') {
      return undefined;
    }

    const state = this.workspaceState();
    const searchParams = new URLSearchParams({
      from: state.analyticsFrom,
      to: state.analyticsTo,
      granularity: state.analyticsGranularity,
    });

    if (state.analyticsQuestionId) {
      searchParams.set('questionId', state.analyticsQuestionId);
    }

    return `${this.apiBaseUrl}/forms/${formId}/analytics/overview?${searchParams.toString()}`;
  }

  private buildAnalyticsQuestionsEndpoint(): string | undefined {
    const formId = this.routeParams()['id'];
    if (!formId || typeof formId !== 'string') {
      return undefined;
    }

    const state = this.workspaceState();
    const searchParams = new URLSearchParams({
      from: state.analyticsFrom,
      to: state.analyticsTo,
      granularity: state.analyticsGranularity,
    });

    if (state.analyticsQuestionId) {
      searchParams.set('questionId', state.analyticsQuestionId);
    }

    return `${this.apiBaseUrl}/forms/${formId}/analytics/questions?${searchParams.toString()}`;
  }

  private buildAnalyticsSegmentsEndpoint(): string | undefined {
    const formId = this.routeParams()['id'];
    if (!formId || typeof formId !== 'string') {
      return undefined;
    }

    const state = this.workspaceState();
    const searchParams = new URLSearchParams({
      from: state.analyticsFrom,
      to: state.analyticsTo,
      granularity: state.analyticsGranularity,
      segmentBy: state.analyticsSegmentBy,
    });

    if (state.analyticsQuestionId) {
      searchParams.set('questionId', state.analyticsQuestionId);
    }

    return `${this.apiBaseUrl}/forms/${formId}/analytics/segments?${searchParams.toString()}`;
  }

  private updateWorkspaceState(
    partial: Partial<ReturnType<typeof parseFormsWorkspaceState>>,
  ): void {
    const next = {
      ...this.workspaceState(),
      ...partial,
    };

    const params: Params = buildFormsWorkspaceQueryParams(next);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }
}
