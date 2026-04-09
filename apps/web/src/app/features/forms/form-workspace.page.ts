import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { API_BASE_URL } from '../../core/api/api-config.token';
import { ApiSuccessEnvelope } from '../../core/api/api-envelope';
import {
  FormStructureDto,
  mapFormStructure,
} from '../../core/api/survey-api.adapters';
import { FormSectionRecord, FormStructureRecord } from '../../shared/models/domain.models';
import {
  FormsWorkspaceTab,
  buildFormsWorkspaceQueryParams,
  parseFormsWorkspaceState,
} from './data/forms-workspace-state';

@Component({
  selector: 'app-form-workspace-page',
  standalone: true,
  imports: [RouterLink],
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

  protected readonly structureResource = httpResource<ApiSuccessEnvelope<FormStructureDto>>(
    () => this.buildStructureEndpoint(),
  );

  protected readonly structure = computed<FormStructureRecord | null>(() => {
    const dto = this.structureResource.value()?.data;
    return dto ? mapFormStructure(dto) : null;
  });

  protected readonly filteredSections = computed<FormSectionRecord[]>(() => {
    const structure = this.structure();
    if (!structure) {
      return [];
    }

    const search = this.workspaceState().search?.trim().toLowerCase();
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

  protected selectTab(tab: FormsWorkspaceTab): void {
    this.updateWorkspaceState({ tab });
  }

  protected updateSearch(value: string): void {
    this.updateWorkspaceState({ search: value || undefined });
  }

  protected updateQuestionType(value: string): void {
    this.updateWorkspaceState({ questionType: value || undefined });
  }

  protected refresh(): void {
    this.structureResource.reload();
  }

  private buildStructureEndpoint(): string | undefined {
    const formId = this.routeParams()['id'];
    if (!formId || typeof formId !== 'string') {
      return undefined;
    }

    return `${this.apiBaseUrl}/forms/${formId}/structure`;
  }

  private updateWorkspaceState(partial: Partial<ReturnType<typeof parseFormsWorkspaceState>>): void {
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
