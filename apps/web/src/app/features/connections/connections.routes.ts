import { Routes } from '@angular/router';

export const CONNECTIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./connections.page').then((m) => m.ConnectionsPageComponent),
  },
];
