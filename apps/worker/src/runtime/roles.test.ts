import { describe, expect, it } from 'vitest';
import { shouldRunExport, shouldRunSync } from './roles.js';

describe('runtime roles', () => {
  it('runs both loops for all role', () => {
    expect(shouldRunSync('all')).toBe(true);
    expect(shouldRunExport('all')).toBe(true);
  });

  it('runs only sync loop for sync role', () => {
    expect(shouldRunSync('sync')).toBe(true);
    expect(shouldRunExport('sync')).toBe(false);
  });

  it('runs only export loop for export role', () => {
    expect(shouldRunSync('export')).toBe(false);
    expect(shouldRunExport('export')).toBe(true);
  });
});
