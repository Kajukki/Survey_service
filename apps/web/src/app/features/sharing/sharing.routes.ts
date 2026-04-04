import { Routes } from '@angular/router';

export const SHARING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./sharing.page').then((m) => m.SharingPageComponent),
  },
];
