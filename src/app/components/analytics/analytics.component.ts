import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import {
  AnalyticsService, Bucket, GameRecord, LeagueOption, LeagueProfile, LeagueTightness, LevelStat, MonthStat,
  Outcomes, PlayerOption, PlayerProfile, ScorerRank, SeasonPoint, Streak, TeamGame, TeamOption, TeamProfile,
  TeamRank, Totals, WDL
} from '../../services/analytics/analytics.service';
import { SeasonService } from '../../services/season/season.service';
import { TeamFavoritesService } from '../../services/favorites/team-favorites.service';
import { LineChartComponent, LineSeries } from '../charts/line-chart.component';
import { Column, ColumnChartComponent } from '../charts/column-chart.component';

type Tab = 'ueberblick' | 'teams' | 'spieler' | 'ligen';
type Board = 'tore' | 'schnitt' | 'talente' | 'vereine';

interface Share { key: string; label: string; count: number; pct: number; }

const TABS: { id: Tab; label: string }[] = [
  { id: 'ueberblick', label: 'Überblick' },
  { id: 'teams', label: 'Teams' },
  { id: 'spieler', label: 'Spieler' },
  { id: 'ligen', label: 'Ligen' }
];
/** Older links used English tab names. */
const TAB_ALIASES: Record<string, Tab> = { overview: 'ueberblick', players: 'spieler', leagues: 'ligen' };
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const BOARD_PAGE = 10;

const norm = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Statistics across all archived seasons: an overview of the sport, and
 * profiles for single teams, players and leagues. All figures are computed in
 * the browser from one small archive file; tab and selection live in the URL.
 */
@Component({
  selector: 'app-analytics',
  imports: [RouterLink, FormsModule, DecimalPipe, MatIcon, LineChartComponent, ColumnChartComponent],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalyticsComponent implements OnInit {
  private analytics = inject(AnalyticsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private teamFavorites = inject(TeamFavoritesService);
  seasonService = inject(SeasonService);

  readonly tabs = TABS;
  readonly tab = signal<Tab>('ueberblick');
  readonly failed = signal(false);

  // ---- Overview ----
  readonly seasons = signal<number[]>([]);
  readonly season = signal<number | null>(null);
  readonly overviewLoading = signal(true);
  readonly totals = signal<Totals | null>(null);
  readonly trend = signal<SeasonPoint[]>([]);
  readonly outcomes = signal<Outcomes | null>(null);
  readonly buckets = signal<Bucket[]>([]);
  readonly topTeams = signal<TeamRank[]>([]);
  readonly highScores = signal<GameRecord[]>([]);
  readonly margins = signal<GameRecord[]>([]);
  readonly streaks = signal<Streak[]>([]);

  // ---- Teams ----
  readonly teamOptions = signal<TeamOption[]>([]);
  readonly teamQuery = signal('');
  readonly team = signal<TeamProfile | null>(null);
  readonly teamLoading = signal(false);

  // ---- Players ----
  readonly playerOptions = signal<PlayerOption[]>([]);
  readonly playerQuery = signal('');
  readonly player = signal<PlayerProfile | null>(null);
  readonly playerLoading = signal(false);
  readonly board = signal<Board>('tore');
  readonly boardRows = signal<ScorerRank[]>([]);
  readonly boardLimit = signal(BOARD_PAGE);

  // ---- Leagues ----
  readonly leagueOptions = signal<LeagueOption[]>([]);
  readonly leagueQuery = signal('');
  readonly league = signal<LeagueProfile | null>(null);
  readonly leagueLoading = signal(false);
  readonly levels = signal<LevelStat[]>([]);
  readonly months = signal<MonthStat[]>([]);
  readonly tightest = signal<LeagueTightness[]>([]);

  private pendingTeamName: string | null = null;
  private loaded = new Set<Tab>();

  // ---- Derived: overview ----------------------------------------------------

  /** Seasons with a comparable amount of data (trend lines skip the others). */
  readonly fullSeasons = computed(() => this.trend().filter(t => !t.partial));
  readonly partialSeasons = computed(() => this.trend().filter(t => t.partial).map(t => this.seasonLabel(t.season)));
  readonly seasonLabels = computed(() => this.fullSeasons().map(t => this.seasonLabel(t.season)));
  readonly goalsTrend = computed<LineSeries[]>(() => [{ name: 'Tore pro Spiel', values: this.fullSeasons().map(t => t.avgGoals) }]);
  readonly homeTrend = computed<LineSeries[]>(() => [{ name: 'Heimsiege', values: this.fullSeasons().map(t => t.homeWinPct) }]);
  readonly gamesPerSeason = computed<Column[]>(() =>
    this.trend().map(t => ({ label: `${String(t.season).slice(2)}/${String(t.season + 1).slice(2)}`, value: t.games })));
  readonly bucketColumns = computed<Column[]>(() => this.buckets().map(b => ({ label: b.label, value: b.count })));

  readonly avgGoals = computed(() => {
    const t = this.totals();
    return t && t.games ? t.goals / t.games : 0;
  });

  readonly outcomeShares = computed<Share[]>(() => {
    const o = this.outcomes();
    if (!o) return [];
    const total = o.home + o.draw + o.away || 1;
    return [
      { key: 'home', label: 'Heimsiege', count: o.home, pct: o.home / total * 100 },
      { key: 'draw', label: 'Unentschieden', count: o.draw, pct: o.draw / total * 100 },
      { key: 'away', label: 'Auswärtssiege', count: o.away, pct: o.away / total * 100 }
    ];
  });

  // ---- Derived: search suggestions -----------------------------------------

  private matches<T extends { name: string }>(options: T[], query: string, limit = 8): T[] {
    const q = norm(query.trim());
    if (q.length < 2) return [];
    const starts: T[] = [], contains: T[] = [];
    for (const o of options) {
      const n = norm(o.name);
      if (n.startsWith(q)) starts.push(o);
      else if (n.includes(q)) contains.push(o);
      if (starts.length >= limit) break;
    }
    return [...starts, ...contains].slice(0, limit);
  }

  readonly teamSuggestions = computed(() => this.matches(this.teamOptions(), this.teamQuery()));
  readonly playerSuggestions = computed(() => this.matches(this.playerOptions(), this.playerQuery()));
  readonly leagueSuggestions = computed(() => this.matches(this.leagueOptions(), this.leagueQuery()));

  /** Followed teams that exist in the archive: shortcuts into the team tab. */
  readonly myTeams = computed(() => {
    const favs = new Set(this.teamFavorites.teams());
    return this.teamOptions().filter(t => favs.has(t.name));
  });

  readonly popularTeams = computed(() => this.teamOptions().slice(0, 8));

  // ---- Derived: team ---------------------------------------------------------

  readonly teamSeasonLabels = computed(() => (this.team()?.seasons ?? []).map(s => this.seasonLabel(s.season)));
  readonly teamWinRate = computed<LineSeries[]>(() =>
    [{ name: 'Siegquote', values: (this.team()?.seasons ?? []).map(s => s.winRate) }]);
  readonly teamGoals = computed<LineSeries[]>(() => {
    const seasons = this.team()?.seasons ?? [];
    const perGame = (n: number, games: number) => (games ? Math.round(n / games * 10) / 10 : null);
    return [
      { name: 'Erzielt', slot: 1, values: seasons.map(s => perGame(s.scored, s.games)) },
      { name: 'Kassiert', slot: 2, values: seasons.map(s => perGame(s.conceded, s.games)) }
    ];
  });

  // ---- Derived: player -------------------------------------------------------

  readonly playerSeasonLabels = computed(() => (this.player()?.seasons ?? []).map(s => this.seasonLabel(s.season)));
  readonly playerGoals = computed<Column[]>(() =>
    (this.player()?.seasons ?? []).map(s => ({ label: `${String(s.season).slice(2)}/${String(s.season + 1).slice(2)}`, value: s.goals })));
  readonly playerAvg = computed<LineSeries[]>(() =>
    // Seasons with only one or two games say little about a scoring rate: gap.
    [{ name: 'Tore pro Spiel', values: (this.player()?.seasons ?? []).map(s => (s.games >= 3 ? s.avg : null)) }]);

  readonly boards: { id: Board; label: string; hint: string }[] = [
    { id: 'tore', label: 'Meiste Tore', hint: 'Alle Saisons zusammen' },
    { id: 'schnitt', label: 'Bester Schnitt', hint: 'Tore pro Spiel, mindestens 30 Spiele' },
    { id: 'talente', label: 'Talente', hint: '21 Jahre und jünger' },
    { id: 'vereine', label: 'Meiste Vereine', hint: 'Für wie viele Vereine getroffen' }
  ];
  readonly boardHint = computed(() => this.boards.find(b => b.id === this.board())?.hint ?? '');
  readonly shownBoard = computed(() => this.boardRows().slice(0, this.boardLimit()));

  // ---- Derived: leagues ------------------------------------------------------

  readonly levelMax = computed(() => Math.max(1, ...this.levels().map(l => l.avgGoals)));
  readonly monthColumns = computed<Column[]>(() =>
    this.months().map(m => ({ label: MONTHS[m.month - 1] ?? String(m.month), value: m.avgGoals })));

  readonly leagueShares = computed<Share[]>(() => {
    const o = this.league()?.outcomes;
    if (!o) return [];
    const total = o.home + o.draw + o.away || 1;
    return [
      { key: 'home', label: 'Heimsiege', count: o.home, pct: o.home / total * 100 },
      { key: 'draw', label: 'Unentschieden', count: o.draw, pct: o.draw / total * 100 },
      { key: 'away', label: 'Auswärtssiege', count: o.away, pct: o.away / total * 100 }
    ];
  });

  // ---- Lifecycle ----------------------------------------------------------------

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const raw = String(params['tab'] || '').toLowerCase();
      const tab = (TABS.find(t => t.id === raw)?.id ?? TAB_ALIASES[raw] ?? 'ueberblick') as Tab;
      this.tab.set(tab);
      this.ensureTab(tab);

      const teamId = Number(params['team']);
      const playerId = Number(params['spielerId']);
      const leagueNo = Number(params['liga']);
      if (tab === 'teams') {
        if (teamId) { if (this.team()?.id !== teamId) this.loadTeam(teamId); }
        else if (params['q']) { this.pendingTeamName = String(params['q']); this.resolvePendingTeam(); }
        else this.team.set(null);
      }
      if (tab === 'spieler') {
        if (playerId) { if (this.player()?.id !== playerId) this.loadPlayer(playerId); }
        else this.player.set(null);
      }
      if (tab === 'ligen') {
        if (leagueNo) { if (this.league()?.no !== leagueNo) this.loadLeague(leagueNo); }
        else this.league.set(null);
      }
    });
  }

  /** Load a tab's data the first time it is shown. */
  private ensureTab(tab: Tab): void {
    if (this.loaded.has(tab)) return;
    this.loaded.add(tab);
    const fail = (e: unknown) => { console.error(e); this.loaded.delete(tab); this.failed.set(true); };

    switch (tab) {
      case 'ueberblick':
        Promise.all([
          this.analytics.getSeasons().then(s => this.seasons.set(s)),
          this.analytics.getSeasonTrend().then(t => this.trend.set(t)),
          this.analytics.getWinningStreaks(5).then(s => this.streaks.set(s)),
          this.loadSeasonFigures()
        ]).catch(fail);
        break;
      case 'teams':
        this.analytics.getTeams().then(t => { this.teamOptions.set(t); this.resolvePendingTeam(); }).catch(fail);
        break;
      case 'spieler':
        this.analytics.getPlayers().then(p => this.playerOptions.set(p)).catch(fail);
        this.loadBoard(this.board());
        break;
      case 'ligen':
        Promise.all([
          this.analytics.getLeagues().then(l => this.leagueOptions.set(l)),
          this.analytics.getLevelComparison().then(l => this.levels.set(l)),
          this.analytics.getMonthPattern().then(m => this.months.set(m)),
          this.analytics.getTightestLeagues(8).then(t => this.tightest.set(t))
        ]).catch(fail);
        break;
    }
  }

  retry(): void {
    this.failed.set(false);
    this.ensureTab(this.tab());
  }

  /** Figures that follow the season filter. */
  private async loadSeasonFigures(): Promise<void> {
    const season = this.season() ?? undefined;
    this.overviewLoading.set(true);
    try {
      const [totals, outcomes, buckets, topTeams, highScores, margins] = await Promise.all([
        this.analytics.getTotals(season),
        this.analytics.getOutcomes(season),
        this.analytics.getGoalBuckets(season),
        this.analytics.getTopTeams(10, season),
        this.analytics.getHighestScoringGames(5, season),
        this.analytics.getBiggestMargins(5, season)
      ]);
      this.totals.set(totals);
      this.outcomes.set(outcomes);
      this.buckets.set(buckets);
      this.topTeams.set(topTeams);
      this.highScores.set(highScores);
      this.margins.set(margins);
    } finally {
      this.overviewLoading.set(false);
    }
  }

  /** "Nur wenige Spiele archiviert: 2011/12 und 2025/26." */
  readonly partialNote = computed(() => {
    const list = this.partialSeasons();
    if (!list.length) return '';
    const names = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}`;
    return `Ohne ${names}: Aus ${list.length === 1 ? 'dieser Saison' : 'diesen Saisons'} sind nur wenige Spiele archiviert.`;
  });

  setSeason(value: string): void {
    this.season.set(value ? Number(value) : null);
    this.loadSeasonFigures().catch(e => { console.error(e); this.failed.set(true); });
  }

  // ---- Navigation -------------------------------------------------------------------

  private go(params: Record<string, string | number | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params });
  }

  selectTab(tab: Tab): void {
    this.go(tab === 'ueberblick' ? {} : { tab });
  }

  openTeam(id: number): void {
    this.teamQuery.set('');
    this.go({ tab: 'teams', team: id });
  }

  openPlayer(id: number): void {
    this.playerQuery.set('');
    this.go({ tab: 'spieler', spielerId: id });
  }

  openLeague(no: number): void {
    this.leagueQuery.set('');
    this.go({ tab: 'ligen', liga: no });
  }

  clearSelection(): void {
    this.go({ tab: this.tab() });
  }

  /** Open an archived league in the league view (switches to its season). */
  showLeagueInArchive(id: string, season: number): void {
    this.seasonService.setSeason(String(season));
    this.router.navigate(['/liga'], { queryParams: { param: id } });
  }

  /** A league of the season DSV serves live cannot be opened from the archive. */
  canOpenLeague(season: number): boolean {
    return String(season) !== this.seasonService.liveSeason();
  }

  // ---- Loading entities -----------------------------------------------------------

  /** Deep link by name (?tab=teams&q=…), e.g. from a team page. */
  private resolvePendingTeam(): void {
    const name = this.pendingTeamName;
    const options = this.teamOptions();
    if (!name || !options.length) return;
    this.pendingTeamName = null;
    const wanted = norm(name.trim());
    const match = options.find(t => norm(t.name) === wanted) ?? options.find(t => norm(t.name).includes(wanted));
    if (match) this.router.navigate([], { relativeTo: this.route, queryParams: { tab: 'teams', team: match.id }, replaceUrl: true });
    else this.teamQuery.set(name);
  }

  private async loadTeam(id: number): Promise<void> {
    this.teamLoading.set(true);
    try {
      this.team.set(await this.analytics.getTeamProfile(id));
    } catch (e) {
      console.error(e);
      this.failed.set(true);
    } finally {
      this.teamLoading.set(false);
    }
  }

  private async loadPlayer(id: number): Promise<void> {
    this.playerLoading.set(true);
    try {
      this.player.set(await this.analytics.getPlayerProfile(id));
    } catch (e) {
      console.error(e);
      this.failed.set(true);
    } finally {
      this.playerLoading.set(false);
    }
  }

  private async loadLeague(no: number): Promise<void> {
    this.leagueLoading.set(true);
    try {
      this.league.set(await this.analytics.getLeagueProfile(no));
    } catch (e) {
      console.error(e);
      this.failed.set(true);
    } finally {
      this.leagueLoading.set(false);
    }
  }

  async loadBoard(board: Board): Promise<void> {
    this.board.set(board);
    this.boardLimit.set(BOARD_PAGE);
    const load = {
      tore: () => this.analytics.getTopScorers(50),
      schnitt: () => this.analytics.getMostEfficient(50),
      talente: () => this.analytics.getYoungTalents(50),
      vereine: () => this.analytics.getJourneymen(50)
    }[board];
    try {
      this.boardRows.set(await load());
    } catch (e) {
      console.error(e);
      this.failed.set(true);
    }
  }

  showMoreBoard(): void {
    this.boardLimit.update(n => n + BOARD_PAGE);
  }

  // ---- Formatting -----------------------------------------------------------------

  seasonLabel(season: number): string {
    return `${season}/${String((season + 1) % 100).padStart(2, '0')}`;
  }

  /** "2024-03-09" -> "09.03.2024" */
  day(value: string | null): string {
    const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
  }

  pct(part: number, total: number): number {
    return total ? Math.round(part / total * 100) : 0;
  }

  resultLabel(result: TeamGame['result']): string {
    return result === 'W' ? 'S' : result === 'D' ? 'U' : 'N';
  }

  /** Widths of a wins/draws/losses bar. */
  wdl(rec: WDL): { w: number; d: number; l: number } {
    const total = rec.games || 1;
    return { w: rec.wins / total * 100, d: rec.draws / total * 100, l: rec.losses / total * 100 };
  }

  /** Value shown at the right of a leaderboard row. */
  boardValue(row: ScorerRank): string {
    switch (this.board()) {
      case 'schnitt': return row.avg.toFixed(2).replace('.', ',');
      case 'vereine': return String(row.clubs);
      default: return String(row.goals);
    }
  }

  boardUnit(): string {
    return this.board() === 'schnitt' ? 'pro Spiel' : this.board() === 'vereine' ? 'Vereine' : 'Tore';
  }
}
