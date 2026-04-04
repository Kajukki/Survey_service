import { Routes } from '@angular/router';

export const SYNC_JOBS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./sync-jobs.page').then((m) => m.SyncJobsPageComponent),
  },
];
