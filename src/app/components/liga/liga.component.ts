import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell, MatHeaderCellDef,
  MatHeaderRow, MatHeaderRowDef,
  MatRow, MatRowDef,
  MatTable, MatTableDataSource
} from "@angular/material/table";
import {Games} from "../../models/games";
import {LigaService} from "../../services/liga/liga.service";
import {MatTab, MatTabGroup} from "@angular/material/tabs";
import {Table} from "../../models/table";
import {NgIf} from "@angular/common";
import {Scorer} from "../../models/scorer";
import {animate, state, style, transition, trigger} from "@angular/animations";
import {MatFormField, MatLabel} from "@angular/material/form-field";
import {MatInput} from "@angular/material/input";
import {MatProgressSpinner} from "@angular/material/progress-spinner";

@Component({
  selector: 'app-liga',
  standalone: true,
  imports: [
    MatTable,
    MatColumnDef,
    MatHeaderCell,
    MatCell,
    MatHeaderRow,
    MatRow,
    MatCellDef,
    MatHeaderCellDef,
    MatHeaderRowDef,
    MatRowDef,
    MatTabGroup,
    MatTab,
    NgIf,
    MatFormField,
    MatInput,
    MatLabel,
    MatProgressSpinner
  ],
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({height: '0px', minHeight: '0'})),
      state('expanded', style({height: '*'})),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
  templateUrl: './liga.component.html',
  styleUrl: './liga.component.scss'
})
export class LigaComponent implements OnInit {

  ligaName: string = '';
  isLoading = true;

  displayedColumnsGames: string[] = ['start', 'homeImage', 'home', 'guest', 'guestImage', 'location', 'result'];
  dataSourceGames: MatTableDataSource<Games> = new MatTableDataSource();
  displayedColumnsTable: string[] = ['place', 'image', 'team', 'games', 'wins', 'draws', 'losses', 'goals', 'goalDifference', 'points'];
  dataSourceTable: MatTableDataSource<Table> = new MatTableDataSource();
  displayedColumnsScorer = ['place', 'player', 'team', 'goals', 'games'];
  dataSourceScorer: MatTableDataSource<Scorer> = new MatTableDataSource();

  expandedElement: Table | null = null;
  expandedGames: Games[] = [];

  constructor(private route: ActivatedRoute, private router: Router, private ligaService: LigaService) {
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      let param = params['param'];
      this.ligaService.getItems(param).subscribe(
        (html: string) => {
          this.ligaName = this.ligaService.getLigaName(html);
          this.dataSourceGames.data = this.ligaService.parseHtmlToGames(html)
          this.dataSourceTable.data = this.ligaService.parseHtmlToTable(html)
          this.dataSourceScorer.data = this.ligaService.parseHtmlToScorer(html)
          this.isLoading = false;
        }
      );
    });
  }

  navigateToMapsLink(element: Games, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    this.ligaService.getLocationLink(element.gameLink).then(
      (locationLink: string) => {
        window.location.href = locationLink;
      }
    );
  }

  getGamesByRow(row: Table) {
    this.expandedGames = this.dataSourceGames.data.filter(game => (game.home === row.team || game.guest === row.team) && game.result.includes(':'));
  }

  checkEventInPast(start: string): boolean {
    try {
      const [datePart, timePart] = start.replace(' Uhr', '').split(', ');
      const [day, month, year] = datePart.split('.').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);

      const eventDate = new Date(2000 + year, month - 1, day, hours, minutes);

      const now = new Date();

      return eventDate < now;
    } catch (error) {
      return false;
    }
  }

  applyGamesFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSourceGames.filter = filterValue.trim().toLowerCase();
  }

  applyScorerFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSourceScorer.filter = filterValue.trim().toLowerCase();
  }

  isGameWon(game: Games, teamName: string): boolean {
    const resultParts = game.result.split(':');
    if (resultParts.length !== 2) return false;

    const homeGoals = parseInt(resultParts[0]);
    const guestGoals = parseInt(resultParts[1]);

    if (game.home === teamName) {
      return homeGoals > guestGoals;
    } else if (game.guest === teamName) {
      return guestGoals > homeGoals;
    }
    return false;
  }

  isGameLost(game: Games, teamName: string): boolean {
    const resultParts = game.result.split(':');
    if (resultParts.length !== 2) return false;

    const homeGoals = parseInt(resultParts[0]);
    const guestGoals = parseInt(resultParts[1]);

    if (game.home === teamName) {
      return homeGoals < guestGoals;
    } else if (game.guest === teamName) {
      return guestGoals < homeGoals;
    }
    return false;
  }

  isGameDraw(game: Games): boolean {
    const resultParts = game.result.split(':');
    if (resultParts.length !== 2) return false;

    const homeGoals = parseInt(resultParts[0]);
    const guestGoals = parseInt(resultParts[1]);

    return homeGoals === guestGoals;
  }

  navigateToGameDetails(game: Games): void {
    // Nur navigieren, wenn ein gameLink vorhanden ist
    if (game.gameLink) {
      // Hole die aktuellen Liga-Parameter
      const currentParams = this.route.snapshot.queryParams;

      // Navigiere mit gameLink UND behalte die Liga-Parameter
      this.router.navigate(['/game-details'], {
        queryParams: {
          param: game.gameLink,
          ligaParam: currentParams['param'] // Speichere Liga-Parameter für Zurück-Navigation
        }
      });
    }
  }
}
