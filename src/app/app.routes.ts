import {Routes} from '@angular/router';




export const routes: Routes = [
  {path: '', loadComponent: () => import('./components/overview/overview.component').then(m => m.OverviewComponent)},
  {path: 'liga', loadComponent: () => import('./components/liga/liga.component').then(m => m.LigaComponent)},
  {path: 'game-details', loadComponent: () => import('./components/game-details/game-details.component').then(m => m.GameDetailsComponent)},
  {path: '**', redirectTo: '', pathMatch: 'full'}
];
