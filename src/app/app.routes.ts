import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Wasserball Live', loadComponent: () => import('./components/home/home.component').then(m => m.HomeComponent) },
  { path: 'ligen', title: 'Ligen – Wasserball Live', loadComponent: () => import('./components/overview/overview.component').then(m => m.OverviewComponent) },
  { path: 'liga', loadComponent: () => import('./components/liga/liga.component').then(m => m.LigaComponent) },
  { path: 'teams', title: 'Meine Teams – Wasserball Live', loadComponent: () => import('./components/teams/teams.component').then(m => m.TeamsComponent) },
  { path: 'team', loadComponent: () => import('./components/team/team.component').then(m => m.TeamComponent) },
  { path: 'game-details', loadComponent: () => import('./components/game-details/game-details.component').then(m => m.GameDetailsComponent) },
  { path: 'live', title: 'Liveticker – Wasserball Live', loadComponent: () => import('./components/live/live.component').then(m => m.LiveComponent) },
  { path: 'analytics', title: 'Statistik – Wasserball Live', loadChildren: () => import('./components/analytics/analytics.routes').then(m => m.ANALYTICS_ROUTES) },
  { path: 'datenschutz', title: 'Datenschutz – Wasserball Live', loadComponent: () => import('./components/privacy/privacy.component').then(m => m.PrivacyComponent) },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
