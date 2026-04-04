export type WorkerState = {
  service: 'worker';
  status: 'ready';
};

export const getWorkerState = (): WorkerState => {
  return {
    service: 'worker',
    status: 'ready',
  };
};
