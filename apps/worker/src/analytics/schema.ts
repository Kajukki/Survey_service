import type { ProviderFormDefinition } from '@survey-service/connectors';

export type PersistedFormSchema = {
  source: 'google_forms_api';
  sections: Array<{
    id: string;
    title: string;
    description?: string;
    order: number;
    questions: Array<{
      id: string;
      externalQuestionId: string;
      sectionId: string;
      label: string;
      description?: string;
      required: boolean;
      type: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
      order: number;
      options?: Array<{ value: string; label: string }>;
    }>;
  }>;
  questionCount: number;
};

export type QuestionLookup = Map<
  string,
  {
    label: string;
    type: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
  }
>;

export function buildPersistedFormSchema(definition: ProviderFormDefinition): PersistedFormSchema {
  const sectionMap = new Map<string, PersistedFormSchema['sections'][number]>();

  for (const section of definition.sections) {
    sectionMap.set(section.id, {
      id: section.id,
      title: section.title,
      description: section.description,
      order: section.order,
      questions: [],
    });
  }

  if (!sectionMap.has('section-0')) {
    sectionMap.set('section-0', {
      id: 'section-0',
      title: 'General',
      order: 0,
      questions: [],
    });
  }

  for (const question of definition.questions) {
    const sectionId = question.sectionId ?? 'section-0';
    const section = sectionMap.get(sectionId);
    if (!section) {
      sectionMap.set(sectionId, {
        id: sectionId,
        title: 'General',
        order: sectionMap.size,
        questions: [],
      });
    }

    const resolvedSection = sectionMap.get(sectionId)!;
    resolvedSection.questions.push({
      id: question.id,
      externalQuestionId: question.id,
      sectionId,
      label: question.label,
      description: question.description,
      required: question.required,
      type: question.type,
      order: question.order,
      options: question.options,
    });
  }

  const sections = [...sectionMap.values()]
    .sort((left, right) => left.order - right.order)
    .map((section) => ({
      ...section,
      questions: section.questions.sort((left, right) => left.order - right.order),
    }));

  return {
    source: 'google_forms_api',
    sections,
    questionCount: sections.reduce((total, section) => total + section.questions.length, 0),
  };
}

export function buildQuestionLookup(schema: PersistedFormSchema): QuestionLookup {
  const map: QuestionLookup = new Map();
  for (const section of schema.sections) {
    for (const question of section.questions) {
      map.set(question.id, {
        label: question.label,
        type: question.type,
      });
    }
  }

  return map;
}
