import type { FormsRepository, FormRow, FormResponseRow } from './forms.repository';

export type FormResponseRecord = {
  id: string;
  submittedAt?: string;
  completion: 'completed' | 'partial';
  answerPreview: Array<{
    questionId: string;
    questionLabel: string;
    questionType?: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
    valuePreview: string;
  }>;
  answers: Record<string, unknown>;
};

export type PersistedFormStructureRecord = {
  sections: Array<{
    id: string;
    title: string;
    description?: string;
    order: number;
    questions: Array<{
      id: string;
      externalQuestionId?: string;
      sectionId?: string;
      label: string;
      description?: string;
      required?: boolean;
      type: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
      options?: Array<{ value: string; label: string }>;
      order: number;
    }>;
  }>;
  questionCount: number;
};

export type FormSummary = {
  id: string;
  ownerId: string;
  connectionId: string;
  externalFormId: string;
  title: string;
  description?: string;
  responseCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface FormsQueryService {
  listAccessibleForms(userId: string): Promise<FormSummary[]>;
  getAccessibleForm(formId: string, userId: string): Promise<FormSummary | null>;
  loadFormStructure(formId: string): Promise<PersistedFormStructureRecord>;
  loadFormResponses(formId: string): Promise<FormResponseRecord[]>;
  getFormResponses(input: {
    formId: string;
    fallbackResponseCount: number;
    pageInput?: unknown;
    perPageInput?: unknown;
    fromInput?: unknown;
    toInput?: unknown;
    questionId?: string;
    answerContainsInput?: unknown;
    completionInput?: unknown;
  }): Promise<{
    responses: FormResponseRecord[];
    appliedFilters: Record<string, unknown>;
    pagination: {
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
    };
  }>;
}

export function createFormsQueryService(deps: {
  repository: FormsRepository;
}): FormsQueryService {
  const mapFormRow = (row: FormRow): FormSummary => ({
    id: row.id,
    ownerId: row.owner_id,
    connectionId: row.connection_id,
    externalFormId: row.external_form_id,
    title: row.title,
    description: row.description ?? undefined,
    responseCount: row.response_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

  const parsePositiveInt = (value: unknown, fallback: number): number => {
    if (typeof value !== 'string') {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  };

  const parseDateParam = (value: unknown): Date | null => {
    if (typeof value !== 'string') {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const normalizeAnswerPreviewJson = (
    value: unknown,
  ): FormResponseRecord['answerPreview'] => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const candidate = item as Record<string, unknown>;
        if (
          typeof candidate.questionId !== 'string' ||
          typeof candidate.questionLabel !== 'string' ||
          typeof candidate.valuePreview !== 'string'
        ) {
          return null;
        }

        return {
          questionId: candidate.questionId,
          questionLabel: candidate.questionLabel,
          ...(candidate.questionType === 'single_choice' ||
          candidate.questionType === 'multi_choice' ||
          candidate.questionType === 'text' ||
          candidate.questionType === 'rating' ||
          candidate.questionType === 'date' ||
          candidate.questionType === 'number'
            ? { questionType: candidate.questionType }
            : {}),
          valuePreview: candidate.valuePreview,
        };
      })
      .filter((item): item is FormResponseRecord['answerPreview'][number] => Boolean(item));
  };

  const normalizeAnswersJson = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  };

  const normalizePersistedFormStructureJson = (
    value: unknown,
  ): PersistedFormStructureRecord | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as Record<string, unknown>;
    if (!Array.isArray(candidate.sections)) {
      return null;
    }

    const sections = candidate.sections
      .map((section): PersistedFormStructureRecord['sections'][number] | null => {
        if (!section || typeof section !== 'object') {
          return null;
        }

        const sectionCandidate = section as Record<string, unknown>;
        if (
          typeof sectionCandidate.id !== 'string' ||
          typeof sectionCandidate.title !== 'string' ||
          typeof sectionCandidate.order !== 'number' ||
          !Array.isArray(sectionCandidate.questions)
        ) {
          return null;
        }

        const questions = sectionCandidate.questions
          .map(
            (
              question,
            ): PersistedFormStructureRecord['sections'][number]['questions'][number] | null => {
              if (!question || typeof question !== 'object') {
                return null;
              }

              const questionCandidate = question as Record<string, unknown>;
              if (
                typeof questionCandidate.id !== 'string' ||
                typeof questionCandidate.label !== 'string' ||
                typeof questionCandidate.order !== 'number' ||
                !['single_choice', 'multi_choice', 'text', 'rating', 'date', 'number'].includes(
                  String(questionCandidate.type),
                )
              ) {
                return null;
              }

              const options = Array.isArray(questionCandidate.options)
                ? questionCandidate.options
                    .map((option) => {
                      if (!option || typeof option !== 'object') {
                        return null;
                      }

                      const optionCandidate = option as Record<string, unknown>;
                      if (
                        typeof optionCandidate.value !== 'string' ||
                        typeof optionCandidate.label !== 'string'
                      ) {
                        return null;
                      }

                      return {
                        value: optionCandidate.value,
                        label: optionCandidate.label,
                      };
                    })
                    .filter(
                      (option): option is { value: string; label: string } => Boolean(option),
                    )
                : undefined;

              return {
                id: questionCandidate.id,
                externalQuestionId:
                  typeof questionCandidate.externalQuestionId === 'string'
                    ? questionCandidate.externalQuestionId
                    : undefined,
                sectionId:
                  typeof questionCandidate.sectionId === 'string'
                    ? questionCandidate.sectionId
                    : undefined,
                label: questionCandidate.label,
                description:
                  typeof questionCandidate.description === 'string'
                    ? questionCandidate.description
                    : undefined,
                required:
                  typeof questionCandidate.required === 'boolean'
                    ? questionCandidate.required
                    : false,
                type: questionCandidate.type as PersistedFormStructureRecord['sections'][number]['questions'][number]['type'],
                ...(options && options.length > 0 ? { options } : {}),
                order: questionCandidate.order,
              };
            },
          )
          .filter(
            (
              question,
            ): question is PersistedFormStructureRecord['sections'][number]['questions'][number] =>
              Boolean(question),
          )
          .sort((left, right) => left.order - right.order);

        return {
          id: sectionCandidate.id,
          title: sectionCandidate.title,
          description:
            typeof sectionCandidate.description === 'string'
              ? sectionCandidate.description
              : undefined,
          order: sectionCandidate.order,
          questions,
        };
      })
      .filter((section): section is PersistedFormStructureRecord['sections'][number] =>
        Boolean(section),
      )
      .sort((left, right) => left.order - right.order);

    const questionCountFromSections = sections.reduce(
      (total, section) => total + section.questions.length,
      0,
    );
    const questionCount =
      typeof candidate.questionCount === 'number'
        ? candidate.questionCount
        : questionCountFromSections;

    return {
      sections,
      questionCount,
    };
  };

  const mapResponseRow = (row: FormResponseRow): FormResponseRecord => ({
    id: row.external_response_id,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : undefined,
    completion: row.completion,
    answerPreview: normalizeAnswerPreviewJson(row.answer_preview_json),
    answers: normalizeAnswersJson(row.answers_json),
  });

  return {
    async listAccessibleForms(userId: string): Promise<FormSummary[]> {
      const [ownedForms, sharedForms] = await Promise.all([
        deps.repository.listOwnedForms(userId),
        deps.repository.listSharedForms(userId),
      ]);

      const dedupedForms = new Map<string, FormRow>();
      for (const row of [...ownedForms, ...sharedForms]) {
        dedupedForms.set(row.id, row);
      }

      return [...dedupedForms.values()]
        .sort(
          (left, right) =>
            new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
        )
        .map(mapFormRow);
    },

    async getAccessibleForm(formId: string, userId: string): Promise<FormSummary | null> {
      const ownedForm = await deps.repository.findOwnedFormById(formId, userId);
      if (ownedForm) {
        return mapFormRow(ownedForm);
      }

      const sharedForm = await deps.repository.findSharedFormById(formId, userId);
      return sharedForm ? mapFormRow(sharedForm) : null;
    },

    async loadFormStructure(formId: string): Promise<PersistedFormStructureRecord> {
      const raw = await deps.repository.getFormSchema(formId);
      const normalized = normalizePersistedFormStructureJson(raw);
      if (!normalized) {
        return {
          sections: [],
          questionCount: 0,
        };
      }

      return normalized;
    },

    async loadFormResponses(formId: string): Promise<FormResponseRecord[]> {
      const rows = await deps.repository.listFormResponses(formId);
      if (rows.length === 0) {
        return [];
      }

      return rows.map(mapResponseRow);
    },

    async getFormResponses(input) {
      const page = parsePositiveInt(input.pageInput, 1);
      const perPage = Math.min(parsePositiveInt(input.perPageInput, 20), 100);
      const from = parseDateParam(input.fromInput);
      const to = parseDateParam(input.toInput);
      const answerContains =
        typeof input.answerContainsInput === 'string' && input.answerContainsInput.trim().length > 0
          ? input.answerContainsInput.trim().toLowerCase()
          : undefined;
      const completion =
        input.completionInput === 'completed' || input.completionInput === 'partial'
          ? input.completionInput
          : undefined;

      const allResponses = await this.loadFormResponses(input.formId);
      const filteredResponses = allResponses.filter((response) => {
        if (completion && response.completion !== completion) {
          return false;
        }

        if (from || to) {
          const submittedAt = response.submittedAt ? new Date(response.submittedAt).getTime() : null;
          if (submittedAt !== null) {
            if (from && submittedAt < from.getTime()) {
              return false;
            }
            if (to && submittedAt > to.getTime()) {
              return false;
            }
          }
        }

        if (
          input.questionId &&
          !response.answerPreview.some((preview) => preview.questionId === input.questionId)
        ) {
          return false;
        }

        if (
          answerContains &&
          !response.answerPreview.some((preview) =>
            preview.valuePreview.toLowerCase().includes(answerContains),
          )
        ) {
          return false;
        }

        return true;
      });

      const total = filteredResponses.length;
      const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;
      const pageOffset = (page - 1) * perPage;
      const pagedResponses = filteredResponses.slice(pageOffset, pageOffset + perPage);

      return {
        responses: pagedResponses,
        appliedFilters: {
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
          ...(input.questionId ? { questionId: input.questionId } : {}),
          ...(answerContains ? { answerContains: input.answerContainsInput } : {}),
          ...(completion ? { completion } : {}),
        },
        pagination: {
          page,
          perPage,
          total,
          totalPages,
        },
      };
    },
  };
}
