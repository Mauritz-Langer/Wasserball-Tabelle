import { Component, OnInit, AfterViewInit, ElementRef, inject, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell, MatHeaderCellDef,
  MatHeaderRow, MatHeaderRowDef,
  MatRow, MatRowDef,
  MatTable, MatTableDataSource
} from "@angular/material/table";
import { Games } from "../../models/games";
import { LigaService } from "../../services/liga/liga.service";
import { MatTab, MatTabGroup, MatTabLabel } from "@angular/material/tabs";
import { Table } from "../../models/table";

import { Scorer } from "../../models/scorer";
import { animate, state, style, transition, trigger } from "@angular/animations";
import { MatFormField, MatLabel, MatPrefix } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatIcon } from "@angular/material/icon";
import { MatCard, MatCardContent } from "@angular/material/card";
import { MatButton, MatIconButton } from "@angular/material/button";

@Component({
  selector: 'app-liga',
  imports: [
    CommonModule,
    FormsModule,
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
    MatTabLabel,
    MatFormField,
    MatInput,
    MatLabel,
    MatProgressSpinner,
    MatIcon,
    MatCard,
    MatCardContent,
    RouterLink,
    MatIconButton,
    MatButton,
    MatPrefix
  ],
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
  templateUrl: './liga.component.html',
  styleUrl: './liga.component.scss'
})
export class LigaComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ligaService = inject(LigaService);


  ligaName: string = '';
  isLoading = true;

  displayedColumnsGames: string[] = ['start', 'homeImage', 'home', 'guest', 'guestImage', 'location', 'result'];
  dataSourceGames: MatTableDataSource<Games> = new MatTableDataSource();
  displayedColumnsTable: string[] = ['place', 'image', 'team', 'games', 'wins', 'draws', 'losses', 'goals', 'goalDifference', 'points', 'form'];
  dataSourceTable: MatTableDataSource<Table> = new MatTableDataSource();
  displayedColumnsScorer = ['place', 'player', 'team', 'goals', 'games'];
  dataSourceScorer: MatTableDataSource<Scorer> = new MatTableDataSource();

  expandedElement: Table | null = null;
  expandedGames: Games[] = [];

  // Gruppierte Spiele nach Spieltag
  groupedGames: Map<string, Games[]> = new Map();

  readonly tableContainer = viewChild<ElementRef<HTMLElement>>('tableContainer');

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      let param = params['param'];
      this.ligaService.fetchLeagueData(param).subscribe(
        (data) => {
          this.ligaName = data.name;
          this.dataSourceGames.data = data.games;
          this.dataSourceTable.data = data.table;
          this.dataSourceScorer.data = data.scorers;

          // Gruppiere Spiele nach Spieltagen
          this.groupGamesByMatchday();

          // Berechne Form für jedes Team
          this.calculateForm();

          this.isLoading = false;
        }
      );
    });
  }

  ngAfterViewInit() {
    // Scroll-Progress-Funktionalität für die Tabelle mit ViewChild
    setTimeout(() => {
      const tableContainer = this.tableContainer();
      if (tableContainer) {
        const tableContainerEl = tableContainer.nativeElement;
        const progressBar = document.querySelector('.scroll-progress .progress-bar') as HTMLElement;

        if (progressBar) {
          const updateScrollProgress = () => {
            const scrollLeft = tableContainerEl.scrollLeft;
            const scrollWidth = tableContainerEl.scrollWidth - tableContainerEl.clientWidth;
            const scrollPercent = scrollWidth > 0 ? (scrollLeft / scrollWidth) * 100 : 0;
            progressBar.style.width = Math.min(scrollPercent, 100) + '%';
          };

          tableContainerEl.addEventListener('scroll', updateScrollProgress);
          // Initial aufrufen
          updateScrollProgress();
        }
      }
    }, 200);
  }

  async navigateToMapsLink(element: Games, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const locationLink = await this.ligaService.getLocationLink(element.gameLink);
    if (locationLink) {
      window.open(locationLink, '_blank');
    }
  }

  getGamesByRow(row: Table) {
    this.expandedGames = this.dataSourceGames.data.filter(game => (game.home === row.team || game.guest === row.team) && game.result.includes(':'));
  }

  checkEventInPast(start: string): boolean {
    try {
      if (!start || start.trim() === '') {
        return false;
      }

      const parts = start.replace(' Uhr', '').split(', ');
      if (parts.length < 2) {
        return false;
      }

      const [datePart, timePart] = parts;
      const dateParts = datePart.split('.');
      const timeParts = timePart.split(':');

      if (dateParts.length < 3 || timeParts.length < 2) {
        return false;
      }

      const [day, month, year] = dateParts.map(Number);
      const [hours, minutes] = timeParts.map(Number);

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

    // Re-gruppiere nach Filter
    this.groupGamesByMatchday();
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

  /**
   * Gruppiert Spiele nach Datum (Spieltag)
   */
  groupGamesByMatchday(): void {
    this.groupedGames = new Map();
    const games = this.dataSourceGames.filteredData;

    games.forEach(game => {
      // Extrahiere nur das Datum (ohne Uhrzeit) z.B. "04.10.24"
      const splitResult = game.start.split(',');
      const datePart = splitResult.length > 0 ? splitResult[0].trim() : game.start;

      if (!this.groupedGames.has(datePart)) {
        this.groupedGames.set(datePart, []);
      }
      this.groupedGames.get(datePart)!.push(game);
    });
  }

  /**
   * Gibt die Spieltage als sortiertes Array zurück
   */
  getMatchdays(): string[] {
    return Array.from(this.groupedGames.keys()).sort((a, b) => {
      // Konvertiere Datum-String in vergleichbare Form
      const dateA = this.parseGermanDate(a);
      const dateB = this.parseGermanDate(b);
      return dateA.getTime() - dateB.getTime(); // Älteste zuerst (aufsteigend)
    });
  }

  /**
   * Parse deutsches Datum (DD.MM.YY)
   */
  private parseGermanDate(dateStr: string): Date {
    try {
      const parts = dateStr.split('.');
      if (parts.length < 3) {
        return new Date();
      }
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const year = parseInt(parts[2]) + 2000;
      return new Date(year, month, day);
    } catch {
      return new Date();
    }
  }

  /**
   * Prüft, ob ein Spieltag in der Vergangenheit liegt
   */
  isMatchdayInPast(matchday: string): boolean {
    try {
      const matchdayDate = this.parseGermanDate(matchday);
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Nur Datum vergleichen
      return matchdayDate < now;
    } catch {
      return false;
    }
  }

  /**
   * Gibt Spiele für einen Spieltag zurück, sortiert nach Zeit (aufsteigend)
   */
  getGamesForMatchday(matchday: string): Games[] {
    const games = this.groupedGames.get(matchday) || [];

    // Sortiere Spiele nach Zeit (früheste/älteste zuerst)
    return games.sort((a, b) => {
      const timeA = this.extractTime(a.start);
      const timeB = this.extractTime(b.start);
      return timeA - timeB; // Aufsteigend
    });
  }

  /**
   * Extrahiert Zeit aus "DD.MM.YY, HH:MM Uhr" Format und gibt Minuten seit Mitternacht zurück
   */
  private extractTime(dateTimeStr: string): number {
    try {
      const timePart = dateTimeStr.split(',')[1]?.trim().replace(' Uhr', '').trim();
      if (!timePart) return 0;

      const [hours, minutes] = timePart.split(':').map(Number);
      return hours * 60 + minutes;
    } catch {
      return 0;
    }
  }

  /**
   * Parse deutsches Datum mit Uhrzeit (DD.MM.YY, HH:MM Uhr)
   */
  parseGermanDateWithTime(dateTimeStr: string): Date | null {
    try {
      const parts = dateTimeStr.replace(' Uhr', '').split(', ');
      if (parts.length < 2) return null;

      const [datePart, timePart] = parts;
      const dateParts = datePart.split('.');
      const timeParts = timePart.split(':');

      if (dateParts.length < 3 || timeParts.length < 2) return null;

      const day = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1;
      const year = parseInt(dateParts[2]) + 2000;
      const hours = parseInt(timeParts[0]);
      const minutes = parseInt(timeParts[1]);

      return new Date(year, month, day, hours, minutes);
    } catch {
      return null;
    }
  }

  /**
   * Berechnet die Form (letzte 5 Spiele) für jedes Team
   */
  calculateForm(): void {
    const games = this.dataSourceGames.data;

    this.dataSourceTable.data.forEach(teamRow => {
      // 1. Alle Spiele dieses Teams finden (nur gespielte Spiele mit Ergebnis)
      const teamGames = games.filter(g =>
        (g.home === teamRow.team || g.guest === teamRow.team) &&
        g.result.includes(':') && g.result !== ' - '
      );

      // 2. Nach Datum sortieren (neueste zuerst)
      teamGames.sort((a, b) => {
        const dateA = this.parseGermanDateWithTime(a.start);
        const dateB = this.parseGermanDateWithTime(b.start);
        if (!dateA || !dateB) return 0;
        return dateB.getTime() - dateA.getTime();
      });

      // 3. Die letzten 5 nehmen und Ergebnis auswerten
      const last5 = teamGames.slice(0, 5).map(game => {
        if (this.isGameWon(game, teamRow.team)) return 'W';
        if (this.isGameDraw(game)) return 'D';
        return 'L';
      });

      teamRow.form = last5;
    });

    // Trigger Change Detection für die Tabelle
    this.dataSourceTable.data = [...this.dataSourceTable.data];
  }

  /**
   * Exportiert Spiele als iCalendar (.ics) Datei
   * @param teamName Optional: Nur Spiele eines bestimmten Teams exportieren
   */
  downloadCalendar(teamName?: string): void {
    // Wenn teamName gesetzt ist, filtere nur dessen Spiele, sonst alle
    const gamesToExport = teamName
      ? this.dataSourceGames.data.filter(g => g.home === teamName || g.guest === teamName)
      : this.dataSourceGames.data;

    // Filter nur zukünftige Spiele
    const futureGames = gamesToExport.filter(g => !this.checkEventInPast(g.start));

    if (futureGames.length === 0) {
      alert('Keine zukünftigen Spiele zum Exportieren gefunden.');
      return;
    }

    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//WasserballTabelle//DE\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n";

    futureGames.forEach(game => {
      const startDate = this.parseGermanDateWithTime(game.start);
      if (!startDate) return;

      // Annahme: Spiel dauert 90 Minuten
      const endDate = new Date(startDate.getTime() + 90 * 60000);

      // Formatieren für ICS: YYYYMMDDTHHmmssZ
      const startStr = this.formatDateForICS(startDate);
      const endStr = this.formatDateForICS(endDate);

      // Eindeutige UID generieren
      const uid = `${startStr}-${game.home.replace(/\s/g, '')}-${game.guest.replace(/\s/g, '')}@wasserball-tabelle.de`;

      // DTSTAMP (Erstellungszeitpunkt)
      const now = new Date();
      const dtstamp = this.formatDateForICS(now);

      icsContent += "BEGIN:VEVENT\n";
      icsContent += `UID:${uid}\n`;
      icsContent += `DTSTAMP:${dtstamp}\n`;
      icsContent += `DTSTART:${startStr}\n`;
      icsContent += `DTEND:${endStr}\n`;
      icsContent += `SUMMARY:${game.home} vs. ${game.guest}\n`;
      icsContent += `DESCRIPTION:Wasserball - ${this.ligaName}\\nErgebnis: ${game.result}\n`;
      if (game.location) {
        icsContent += `LOCATION:${game.location}\n`;
      }
      icsContent += "STATUS:CONFIRMED\n";
      icsContent += "TRANSP:OPAQUE\n";
      icsContent += "END:VEVENT\n";
    });

    icsContent += "END:VCALENDAR";

    // Download auslösen
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = teamName
      ? `spielplan_${teamName.replace(/\s/g, '_')}.ics`
      : `spielplan_${this.ligaName.replace(/\s/g, '_')}.ics`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Formatiert ein Datum für ICS-Format: YYYYMMDDTHHmmss
   */
  private formatDateForICS(date: Date): string {
    const pad = (n: number) => n < 10 ? '0' + n : n.toString();

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
  }
}

