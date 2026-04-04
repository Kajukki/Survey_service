import { Routes } from '@angular/router';

export const EXPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./exports.page').then((m) => m.ExportsPageComponent),
  },
];
