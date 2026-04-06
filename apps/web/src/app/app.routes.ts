import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { AppShellComponent } from './layout/app-shell.component';

export const appRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./core/auth/login.page').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./core/auth/login.page').then((m) => m.LoginPageComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./core/auth/callback.page').then((m) => m.AuthCallbackPageComponent),
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
      },
      {
        path: 'connections',
        loadChildren: () =>
          import('./features/connections/connections.routes').then((m) => m.CONNECTIONS_ROUTES),
      },
      {
        path: 'forms',
        loadChildren: () => import('./features/forms/forms.routes').then((m) => m.FORMS_ROUTES),
      },
      {
        path: 'sync-jobs',
        loadChildren: () =>
          import('./features/sync-jobs/sync-jobs.routes').then((m) => m.SYNC_JOBS_ROUTES),
      },
      {
        path: 'exports',
        loadChildren: () =>
          import('./features/exports/exports.routes').then((m) => m.EXPORTS_ROUTES),
      },
      {
        path: 'sharing',
        loadChildren: () =>
          import('./features/sharing/sharing.routes').then((m) => m.SHARING_ROUTES),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
