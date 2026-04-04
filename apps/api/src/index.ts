export type HealthStatus = {
  service: 'api';
  status: 'ok';
};

export const getHealthStatus = (): HealthStatus => {
  return {
    service: 'api',
    status: 'ok',
  };
};
