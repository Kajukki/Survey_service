import { describe, expect, it, vi } from 'vitest';
import { createFormsQueryService } from './forms.query-service';
import type { FormsRepository } from './forms.repository';

function makeRepository(overrides?: Partial<FormsRepository>): FormsRepository {
  return {
    listOwnedForms: vi.fn(async () => []),
    listSharedForms: vi.fn(async () => []),
    findOwnedFormById: vi.fn(async () => null),
    findSharedFormById: vi.fn(async () => null),
    getFormSchema: vi.fn(async () => null),
    listFormResponses: vi.fn(async () => []),
    ...overrides,
  };
}

describe('createFormsQueryService', () => {
  it('dedupes and sorts accessible forms by updatedAt desc', async () => {
    const repository = makeRepository({
      listOwnedForms: vi.fn(async () => [
        {
          id: 'form-1',
          owner_id: 'user-one',
          connection_id: 'conn-1',
          external_form_id: 'ext-1',
          title: 'Owned form',
          description: null,
          response_count: 3,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      listSharedForms: vi.fn(async () => [
        {
          id: 'form-1',
          owner_id: 'user-one',
          connection_id: 'conn-1',
          external_form_id: 'ext-1',
          title: 'Shared duplicate',
          description: null,
          response_count: 5,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-04T00:00:00.000Z',
        },
        {
          id: 'form-2',
          owner_id: 'user-two',
          connection_id: 'conn-2',
          external_form_id: 'ext-2',
          title: 'Shared form',
          description: 'Shared description',
          response_count: 7,
          created_at: '2026-04-03T00:00:00.000Z',
          updated_at: '2026-04-03T00:00:00.000Z',
        },
      ]),
    });

    const service = createFormsQueryService({ repository });
    const results = await service.listAccessibleForms('user-one');

    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('form-1');
    expect(results[0]?.title).toBe('Shared duplicate');
    expect(results[1]?.id).toBe('form-2');
  });

  it('filters responses by completion and questionId with pagination', async () => {
    const repository = makeRepository({
      listFormResponses: vi.fn(async () => [
        {
          external_response_id: 'resp-1',
          submitted_at: '2026-04-10T10:00:00.000Z',
          completion: 'completed',
          answer_preview_json: [
            {
              questionId: 'q-1',
              questionLabel: 'Q1',
              questionType: 'text',
              valuePreview: 'Alpha',
            },
          ],
          answers_json: { 'q-1': 'Alpha' },
        },
        {
          external_response_id: 'resp-2',
          submitted_at: '2026-04-11T10:00:00.000Z',
          completion: 'partial',
          answer_preview_json: [
            {
              questionId: 'q-2',
              questionLabel: 'Q2',
              questionType: 'text',
              valuePreview: 'Beta',
            },
          ],
          answers_json: { 'q-2': 'Beta' },
        },
      ]),
    });

    const service = createFormsQueryService({ repository });
    const result = await service.getFormResponses({
      formId: 'form-1',
      fallbackResponseCount: 2,
      pageInput: '1',
      perPageInput: '1',
      completionInput: 'completed',
      questionId: 'q-1',
    });

    expect(result.responses).toHaveLength(1);
    expect(result.responses[0]?.id).toBe('resp-1');
    expect(result.pagination.total).toBe(1);
  });

  it('normalizes persisted form structure when schema is valid', async () => {
    const repository = makeRepository({
      getFormSchema: vi.fn(async () => ({
        sections: [
          {
            id: 'section-1',
            title: 'Section',
            description: 'Desc',
            order: 1,
            questions: [
              {
                id: 'question-1',
                label: 'Question',
                order: 1,
                type: 'text',
                required: true,
                options: [],
              },
            ],
          },
        ],
        questionCount: 1,
      })),
    });

    const service = createFormsQueryService({ repository });
    const structure = await service.loadFormStructure('form-1');

    expect(structure.sections).toHaveLength(1);
    expect(structure.questionCount).toBe(1);
  });
});
