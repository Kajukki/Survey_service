import { describe, expect, it } from 'vitest';
import { mockForms } from './forms.mock';

describe('forms.mock ownership', () => {
  it('keeps all mock forms readable by UserOne', () => {
    expect(mockForms).toHaveLength(3);
    expect(mockForms.every((form) => form.ownerId === 'user-one')).toBe(true);
  });
});
