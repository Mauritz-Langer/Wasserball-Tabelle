import {Routes} from '@angular/router';
import {OverviewComponent} from './components/overview/overview.component';
import {LigaComponent} from './components/liga/liga.component';

export const routes: Routes = [
  {path: '', component: OverviewComponent},
  {path: 'liga', component: LigaComponent},
  {path: '**', redirectTo: '', pathMatch: 'full'}
];
