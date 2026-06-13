import { Component, OnInit, OnDestroy, AfterViewInit, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell, MatHeaderCellDef,
  MatHeaderRow, MatHeaderRowDef,
  MatRow, MatRowDef,
  MatTable, MatTableDataSource
} from "@angular/material/table";
import { MatSort, MatSortModule } from "@angular/material/sort";
import { Games } from "../../models/games";
import { LigaService } from "../../services/liga/liga.service";
import { MatTab, MatTabGroup, MatTabLabel } from "@angular/material/tabs";
import { Table } from "../../models/table";

import { Scorer } from "../../models/scorer";
import { animate, state, style, transition, trigger } from "@angular/animations";
import { MatFormField, MatLabel, MatPrefix } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatIcon } from "@angular/material/icon";
import { MatCard, MatCardContent } from "@angular/material/card";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatTooltip } from "@angular/material/tooltip";
import { MatSnackBar } from "@angular/material/snack-bar";
import { SeasonService } from "../../services/season/season.service";
import { TeamFavoritesService } from "../../services/favorites/team-favorites.service";
import { LiveTickerService } from "../../services/live-ticker/live-ticker.service";
import { parseGameLink, gameKey } from "../../models/game-ref";

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
    MatIcon,
    MatCard,
    MatCardContent,
    RouterLink,
    MatIconButton,
    MatButton,
    MatPrefix,
    MatSortModule,
    MatTooltip
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
export class LigaComponent implements OnInit, AfterViewInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ligaService = inject(LigaService);
  private snackBar = inject(MatSnackBar);
  public seasonService = inject(SeasonService);
  public teamFavorites = inject(TeamFavoritesService);
  public liveTicker = inject(LiveTickerService);


  ligaName: string = '';
  isLoading = true;
  isRefreshing = false;

  // UI state mirrored in the URL for shareable/bookmarkable deep links.
  activeTabIndex = 0;
  gamesFilter = '';
  scorerFilter = '';
  private readonly tabNames = ['spiele', 'tabelle', 'torschuetzen'];
  private currentLeagueParam: string | null = null;
  private pendingGamesFilter = '';
  private pendingScorerFilter = '';
  private readonly gamesFilter$ = new Subject<string>();
  private readonly scorerFilter$ = new Subject<string>();
  private destroyRef = inject(DestroyRef);

  displayedColumnsGames: string[] = ['start', 'homeImage', 'home', 'guest', 'guestImage', 'location', 'result'];
  dataSourceGames: MatTableDataSource<Games> = new MatTableDataSource();
  displayedColumnsTable: string[] = ['place', 'image', 'team', 'games', 'wins', 'draws', 'losses', 'goals', 'goalDifference', 'points', 'form', 'expand'];
  dataSourceTable: MatTableDataSource<Table> = new MatTableDataSource();
  displayedColumnsScorer = ['place', 'player', 'team', 'goals', 'games'];
  dataSourceScorer: MatTableDataSource<Scorer> = new MatTableDataSource();

  expandedElement: Table | null = null;
  expandedGames: Games[] = [];

  // Gruppierte Spiele nach Spieltag
  groupedGames: Map<string, Games[]> = new Map();

  readonly tableContainer = viewChild<ElementRef<HTMLElement>>('tableContainer');
  readonly tableSort = viewChild(MatSort);

  private scrollSetupTimer?: ReturnType<typeof setTimeout>;
  private scrollEl: HTMLElement | null = null;
  private scrollHandler: (() => void) | null = null;
  private connectedLive = false;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    // The "goals" column is a "scored:conceded" string and "team" should sort
    // alphabetically; everything else is numeric.
    this.dataSourceTable.sortingDataAccessor = (item: any, prop: string) => {
      if (prop === 'goals') return parseInt(String(item.goals).split(':')[0], 10) || 0;
      if (prop === 'team') return String(item.team).toLowerCase();
      return item[prop];
    };
  }

  ngOnInit(): void {
    // Debounce the search inputs so filtering doesn't run on every keystroke.
    this.gamesFilter$.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.applyGamesFilter(v));
    this.scorerFilter$.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.applyScorerFilter(v));

    this.route.queryParams.subscribe(params => {
      // Restore tab from the URL on every change (cheap, no refetch).
      const tabIdx = this.tabNames.indexOf((params['tab'] || '').toLowerCase());
      this.activeTabIndex = tabIdx >= 0 ? tabIdx : 0;

      // Only (re)fetch league data when the league itself changes — not when we
      // ourselves update tab/filter query params.
      const leagueParam = params['param'];
      if (leagueParam !== this.currentLeagueParam) {
        this.currentLeagueParam = leagueParam;
        this.pendingGamesFilter = params['gf'] || '';
        this.pendingScorerFilter = params['sf'] || '';
        this.fetchLeague(leagueParam);
      }
    });
  }

  private fetchLeague(param: string, forceRefresh = false, keepContent = false): void {
    if (keepContent) {
      this.isRefreshing = true; // refresh: keep current content, just spin the button
    } else {
      this.isLoading = true;
    }
    // Connect to the liveticker for the current season so we can flag games
    // that are being played right now (cross-link into the live view).
    if (this.seasonService.isCurrentSeason) {
      this.connectedLive = true;
      this.liveTicker.connect();
    }
    this.ligaService.fetchLeagueData(param, forceRefresh).subscribe((data) => {
      this.ligaName = data.name;
      this.dataSourceGames.data = data.games;
      this.dataSourceTable.data = data.table;
      this.dataSourceScorer.data = data.scorers;

      // Restore filters captured from the URL.
      this.gamesFilter = this.pendingGamesFilter;
      this.scorerFilter = this.pendingScorerFilter;
      this.dataSourceGames.filter = this.gamesFilter.trim().toLowerCase();
      this.dataSourceScorer.filter = this.scorerFilter.trim().toLowerCase();

      this.groupGamesByMatchday();
      this.calculateForm();
      this.isLoading = false;
      this.isRefreshing = false;
    });
  }

  /** Persist UI state (tab/filters) in the URL without polluting history. */
  private updateUrl(params: Record<string, string | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onTabChange(index: number): void {
    this.activeTabIndex = index;
    this.updateUrl({ tab: index > 0 ? this.tabNames[index] : null });
  }

  /** Re-fetch live data, bypassing the session cache (keeps current content). */
  refresh(): void {
    if (this.currentLeagueParam && !this.isRefreshing) {
      this.fetchLeague(this.currentLeagueParam, true, true);
    }
  }

  ngAfterViewInit() {
    // Enable column sorting on the standings table.
    const sort = this.tableSort();
    if (sort) {
      this.dataSourceTable.sort = sort;
    }

    // Scroll-Progress-Funktionalität für die Tabelle mit ViewChild
    this.scrollSetupTimer = setTimeout(() => {
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
          // Keep references so we can detach on destroy.
          this.scrollEl = tableContainerEl;
          this.scrollHandler = updateScrollProgress;
          updateScrollProgress();
        }
      }
    }, 200);
  }

  ngOnDestroy(): void {
    if (this.scrollSetupTimer !== undefined) clearTimeout(this.scrollSetupTimer);
    if (this.scrollEl && this.scrollHandler) {
      this.scrollEl.removeEventListener('scroll', this.scrollHandler);
    }
    if (this.connectedLive) {
      this.liveTicker.disconnect();
    }
  }

  /** Shared game key for a Liga game (from its DSV gameLink), or '' if none. */
  private liveKeyOf(game: Games): string {
    const ref = parseGameLink(game.gameLink);
    return ref ? gameKey(ref) : '';
  }

  /** Is this game being played right now (per the liveticker)? */
  isGameLive(game: Games): boolean {
    if (!this.seasonService.isCurrentSeason) return false;
    const key = this.liveKeyOf(game);
    return !!key && this.liveTicker.liveNowKeys().has(key);
  }

  /** Number of games of this league currently live. */
  get liveCount(): number {
    return this.dataSourceGames.data.filter(g => this.isGameLive(g)).length;
  }

  /** Open the liveticker focused on this game. */
  openLive(game: Games, event?: Event): void {
    event?.stopPropagation();
    const key = this.liveKeyOf(game);
    this.router.navigate(['/live'], { queryParams: key ? { game: key } : {} });
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

  /**
   * Canonical parser for the DSV date format "DD.MM.YY[YY][, HH:MM[ Uhr]]".
   * Handles both 2- and 4-digit years; returns null when unparseable.
   */
  private parseGameDate(value: string): Date | null {
    if (!value || !value.trim()) return null;
    const [datePart, timePart] = value.replace(' Uhr', '').split(',').map(s => s.trim());
    const d = datePart?.split('.');
    if (!d || d.length < 3) return null;

    const day = parseInt(d[0], 10);
    const month = parseInt(d[1], 10) - 1;
    let year = parseInt(d[2], 10);
    if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
    if (year < 100) year += 2000; // 2-digit year -> 20YY

    let hours = 0, minutes = 0;
    if (timePart) {
      const t = timePart.split(':');
      hours = parseInt(t[0], 10) || 0;
      minutes = parseInt(t[1], 10) || 0;
    }
    return new Date(year, month, day, hours, minutes);
  }

  checkEventInPast(start: string): boolean {
    const eventDate = this.parseGameDate(start);
    return eventDate ? eventDate < new Date() : false;
  }

  /** Debounced: called on every keystroke; the actual filtering is throttled. */
  onGamesFilterChange(): void {
    this.gamesFilter$.next(this.gamesFilter);
  }

  onScorerFilterChange(): void {
    this.scorerFilter$.next(this.scorerFilter);
  }

  clearGamesFilter(): void {
    this.gamesFilter = '';
    this.applyGamesFilter('');
  }

  clearScorerFilter(): void {
    this.scorerFilter = '';
    this.applyScorerFilter('');
  }

  private applyGamesFilter(value: string): void {
    this.dataSourceGames.filter = value.trim().toLowerCase();
    this.groupGamesByMatchday();
    this.updateUrl({ gf: value || null });
  }

  private applyScorerFilter(value: string): void {
    this.dataSourceScorer.filter = value.trim().toLowerCase();
    this.updateUrl({ sf: value || null });
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

  /** Goals-per-game average for a scorer, German-formatted ("1,5" or "–"). */
  goalAverage(goals: number, games: number): string {
    if (!games || games <= 0) return '–';
    return (goals / games).toFixed(1).replace('.', ',');
  }

  /** Whether a game already has a result (vs. an upcoming/unplayed game). */
  isPlayed(game: Games): boolean {
    const r = (game.result || '').trim();
    return r !== '' && r !== '-' && r !== '- ' && r.includes(':');
  }

  /** Result class from the perspective of the user's favourite team (if any). */
  favResultClass(game: Games): string {
    if (!this.isPlayed(game)) return '';
    const fav = this.teamFavorites.isFavorite(game.home) ? game.home
      : this.teamFavorites.isFavorite(game.guest) ? game.guest : null;
    if (!fav) return '';
    if (this.isGameWon(game, fav)) return 'fav-won';
    if (this.isGameLost(game, fav)) return 'fav-lost';
    if (this.isGameDraw(game)) return 'fav-draw';
    return '';
  }

  involvesFavorite(game: Games): boolean {
    return this.teamFavorites.isFavorite(game.home) || this.teamFavorites.isFavorite(game.guest);
  }

  toggleTeamFavorite(teamName: string): void {
    this.teamFavorites.toggle(teamName);
    const nowFav = this.teamFavorites.isFavorite(teamName);
    const msg = nowFav
      ? `„${teamName}" als Lieblingsteam gemerkt`
      : `„${teamName}" aus Favoriten entfernt`;
    this.snackBar.open(msg, 'Rückgängig', { duration: 4000 })
      .onAction().subscribe(() => this.teamFavorites.toggle(teamName));
  }

  isTeamGameFavorite(game: Games): boolean {
    return this.teamFavorites.isFavorite(game.home) || this.teamFavorites.isFavorite(game.guest);
  }

  /** The soonest upcoming game involving one of the user's favourite teams. */
  get nextFavoriteGame(): Games | null {
    if (this.teamFavorites.teams().length === 0) return null;
    const upcoming = this.dataSourceGames.data
      .filter(g => this.isTeamGameFavorite(g) && !this.checkEventInPast(g.start))
      .sort((a, b) =>
        (this.parseGameDate(a.start)?.getTime() ?? 0) - (this.parseGameDate(b.start)?.getTime() ?? 0));
    return upcoming[0] ?? null;
  }

  /** Open the cross-season statistics for a team in the analytics view. */
  navigateToTeamStats(teamName: string): void {
    if (!teamName) return;
    this.router.navigate(['/analytics'], {
      queryParams: { tab: 'teams', q: teamName }
    });
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
    return this.parseGameDate(dateStr) ?? new Date();
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
    const d = this.parseGameDate(dateTimeStr);
    return d ? d.getHours() * 60 + d.getMinutes() : 0;
  }

  /**
   * Parse deutsches Datum mit Uhrzeit (DD.MM.YY, HH:MM Uhr)
   */
  parseGermanDateWithTime(dateTimeStr: string): Date | null {
    return this.parseGameDate(dateTimeStr);
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

