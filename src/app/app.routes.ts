import {Routes} from '@angular/router';
import {OverviewComponent} from './components/overview/overview.component';
import {LigaComponent} from './components/liga/liga.component';
import {GameDetailsComponent} from './components/game-details/game-details.component';

export const routes: Routes = [
  {path: '', component: OverviewComponent},
  {path: 'liga', component: LigaComponent},
  {path: 'game-details', component: GameDetailsComponent},
  {path: '**', redirectTo: '', pathMatch: 'full'}
];
