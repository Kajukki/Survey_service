export type WorkerRole = 'all' | 'sync' | 'export';

export function shouldRunSync(role: WorkerRole): boolean {
  return role === 'all' || role === 'sync';
}

export function shouldRunExport(role: WorkerRole): boolean {
  return role === 'all' || role === 'export';
}
