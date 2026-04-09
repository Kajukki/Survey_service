import { Routes } from '@angular/router';

export const FORMS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./forms.page').then((m) => m.FormsPageComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./form-workspace.page').then((m) => m.FormWorkspacePageComponent),
  },
];
