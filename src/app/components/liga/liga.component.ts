import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell, MatHeaderCellDef,
  MatHeaderRow, MatHeaderRowDef,
  MatRow, MatRowDef,
  MatTable
} from "@angular/material/table";
import {Games} from "../../models/games";
import {LigaService} from "../../services/liga/liga.service";
import {MatTab, MatTabGroup} from "@angular/material/tabs";
import {Table} from "../../models/table";
import {NgIf} from "@angular/common";
import {Scorer} from "../../models/scorer";
import {animate, state, style, transition, trigger} from "@angular/animations";

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
    NgIf
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
  dataSourceGames: Games[] = [];
  displayedColumnsTable: string[] = ['place', 'team', 'games', 'wins', 'draws', 'losses', 'goals', 'goalDifference', 'points'];
  dataSourceTable: Table[] = [];
  displayedColumnsScorer: string[] = ['place', 'player', 'team', 'goals', 'games'];
  dataSourceScorer: Scorer[] = [];

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
          this.dataSourceGames = this.ligaService.parseHtmlToGames(html)
          this.dataSourceTable = this.ligaService.parseHtmlToTable(html)
          this.dataSourceScorer = this.ligaService.parseHtmlToScorer(html)
        }
      );
    });
  }

  navigateToMapsLink(element: Games) {
    this.ligaService.getLocationLink(element.gameLink).then(
      (locationLink: string) => {
        window.open(locationLink, '_blank', 'noopener,noreferrer');
      });
  }

  getGamesByRow(row: Table) {
    this.expandedGames = this.dataSourceGames.filter(game => (game.home === row.team || game.guest === row.team) && game.result.includes(':'));
  }
}
