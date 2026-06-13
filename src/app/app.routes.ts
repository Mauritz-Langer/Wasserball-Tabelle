import { Routes } from '@angular/router';




export const routes: Routes = [
  { path: '', loadComponent: () => import('./components/overview/overview.component').then(m => m.OverviewComponent) },
  { path: 'liga', loadComponent: () => import('./components/liga/liga.component').then(m => m.LigaComponent) },
  { path: 'game-details', loadComponent: () => import('./components/game-details/game-details.component').then(m => m.GameDetailsComponent) },
  { path: 'analytics', loadComponent: () => import('./components/analytics/analytics.component').then(m => m.AnalyticsComponent) },
  { path: 'live', loadComponent: () => import('./components/live/live.component').then(m => m.LiveComponent) },
  { path: 'datenschutz', loadComponent: () => import('./components/privacy/privacy.component').then(m => m.PrivacyComponent) },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
