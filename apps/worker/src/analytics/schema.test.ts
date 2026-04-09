import { describe, expect, it } from 'vitest';
import type { ProviderFormDefinition } from '@survey-service/connectors';
import { buildPersistedFormSchema, buildQuestionLookup } from './schema.js';

function sampleDefinition(): ProviderFormDefinition {
  return {
    provider: 'google',
    externalFormId: 'form-1',
    title: 'Test form',
    sections: [
      { id: 's-1', title: 'Section 1', order: 1 },
      { id: 's-0', title: 'Section 0', order: 0 },
    ],
    questions: [
      {
        id: 'q-2',
        sectionId: 's-1',
        label: 'Q2',
        required: true,
        type: 'single_choice',
        order: 2,
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      {
        id: 'q-1',
        sectionId: 's-1',
        label: 'Q1',
        required: false,
        type: 'text',
        order: 1,
      },
      {
        id: 'q-3',
        label: 'Q3',
        required: false,
        type: 'rating',
        order: 0,
      },
    ],
  };
}

describe('schema utilities', () => {
  it('builds sections and question ordering deterministically', () => {
    const schema = buildPersistedFormSchema(sampleDefinition());

    expect(schema.source).toBe('google_forms_api');
    expect(schema.sections.map((section) => section.id)).toEqual(['s-0', 'section-0', 's-1']);
    expect(schema.sections[2]?.questions.map((question) => question.id)).toEqual(['q-1', 'q-2']);
    expect(schema.questionCount).toBe(3);
  });

  it('adds fallback section for questions without section', () => {
    const schema = buildPersistedFormSchema(sampleDefinition());

    const fallbackSection = schema.sections.find((section) => section.id === 'section-0');
    expect(fallbackSection).toBeDefined();
    expect(fallbackSection?.questions.map((question) => question.id)).toEqual(['q-3']);
  });

  it('creates question lookup map', () => {
    const schema = buildPersistedFormSchema(sampleDefinition());
    const lookup = buildQuestionLookup(schema);

    expect(lookup.get('q-1')).toEqual({ label: 'Q1', type: 'text' });
    expect(lookup.get('q-2')).toEqual({ label: 'Q2', type: 'single_choice' });
    expect(lookup.get('q-3')).toEqual({ label: 'Q3', type: 'rating' });
  });
});
