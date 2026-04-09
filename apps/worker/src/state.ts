export type WorkerState = {
  service: 'worker';
  status: 'ready' | 'running';
};

let currentState: WorkerState = {
  service: 'worker',
  status: 'ready',
};

export function getWorkerState(): WorkerState {
  return currentState;
}

export function setWorkerState(nextState: WorkerState): void {
  currentState = nextState;
}
