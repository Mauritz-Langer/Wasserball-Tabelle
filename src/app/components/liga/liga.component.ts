import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
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
    MatLabel
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

  displayedColumnsGames: string[] = ['start', 'home', 'guest', 'location', 'result'];
  dataSourceGames: MatTableDataSource<Games> = new MatTableDataSource();
  displayedColumnsTable: string[] = ['place', 'team', 'games', 'wins', 'draws', 'losses', 'goals', 'goalDifference', 'points'];
  dataSourceTable: MatTableDataSource<Table> = new MatTableDataSource();
  displayedColumnsScorer = ['place', 'player', 'team', 'goals', 'games'];
  dataSourceScorer: MatTableDataSource<Scorer> = new MatTableDataSource();

  expandedElement: Table | null = null;
  expandedGames: Games[] = [];

  constructor(private route: ActivatedRoute, private ligaService: LigaService) {
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      let param = params['param'];
      this.ligaService.getItems(param).subscribe(
        (html: string) => {
          // Process the HTML content to extract items
          this.ligaName = this.ligaService.getLigaName(html);
          this.dataSourceGames.data = this.ligaService.parseHtmlToGames(html)
          this.dataSourceTable.data = this.ligaService.parseHtmlToTable(html)
          this.dataSourceScorer.data = this.ligaService.parseHtmlToScorer(html)
        }
      );
    });
  }

  navigateToMapsLink(element: Games, event: Event) {
    event.stopPropagation()
    this.ligaService.getLocationLink(element.gameLink).then(
      (locationLink: string) => {
        window.open(locationLink, '_blank', 'noopener,noreferrer');
      });
  }

  getGamesByRow(row: Table) {
    this.expandedGames = this.dataSourceGames.data.filter(game => (game.home === row.team || game.guest === row.team) && game.result.includes(':'));
  }

  checkEventInPast(start: string): boolean {
    try {
      const [datePart, timePart] = start.replace(' Uhr', '').split(', ');
      const [day, month, year] = datePart.split('.').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);

      // Create a Date object
      const eventDate = new Date(2000 + year, month - 1, day, hours, minutes);

      // Get the current date and time
      const now = new Date();

      // Check if the event date is in the past
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
}
