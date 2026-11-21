import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Games } from '../../models/games';
import { Table } from '../../models/table';
import { Scorer } from '../../models/scorer';
import { LigaService, LeagueData } from '../../services/liga/liga.service';
import { OverviewService } from '../../services/overview/overview.service';
import { SeasonService } from '../../services/season/season.service';
import { HistoryService } from '../../services/history/history.service';
import { FavoritesService, LeagueRef } from '../../services/favorites/favorites.service';
import { TeamFavoritesService } from '../../services/favorites/team-favorites.service';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { TrackingService } from '../../services/tracking/tracking.service';
import { NavigationService } from '../../services/navigation/navigation.service';
import { parseGameLink, gameKey } from '../../models/game-ref';
import {
  Outcome, dayKey, dayLabel, decimal, formOf, gameTime, involves, isPlayed, parseGameDate, refreshOnReturn
} from '../../models/game-utils';
import { downloadCalendar } from '../../models/ics';
import { GameRowComponent } from '../game-row/game-row.component';
import { LogoFallbackDirective } from '../../directives/logo-fallback.directive';
import { teamInitial } from '../../models/game-utils';
import { TeamIndexService } from '../../services/team-index/team-index.service';

type Tab = 'spiele' | 'tabelle' | 'torschuetzen';
type GamesView = 'alle' | 'kommend' | 'ergebnisse' | 'meine';
type SortKey = 'place' | 'team' | 'games' | 'wins' | 'draws' | 'losses' | 'goals' | 'goalDifference' | 'points';

interface DayGroup { key: string; label: string; round: string; past: boolean; games: Games[]; }
interface TableRow extends Table { form: Outcome[]; favorite: boolean; }
interface ScorerRow extends Scorer { player: string; year: string; average: string; }

const TABS: Tab[] = ['spiele', 'tabelle', 'torschuetzen'];
const VIEWS: GamesView[] = ['alle', 'kommend', 'ergebnisse', 'meine'];
const SCORER_PAGE = 40;

/**
 * League hub: fixtures and results, standings and top scorers of one league.
 * Tab, filters and search live in the URL, so every state can be shared.
 */
@Component({
  selector: 'app-liga',
  imports: [RouterLink, FormsModule, MatIcon, MatMenuModule, GameRowComponent, LogoFallbackDirective],
  templateUrl: './liga.component.html',
  styleUrl: './liga.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LigaComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private title = inject(Title);
  private ligaService = inject(LigaService);
  private overviewService = inject(OverviewService);
  private snackBar = inject(MatSnackBar);
  private tracking = inject(TrackingService);
  private destroyRef = inject(DestroyRef);
  private navigation = inject(NavigationService);
  seasonService = inject(SeasonService);
  favorites = inject(FavoritesService);
  teamFavorites = inject(TeamFavoritesService);
  liveTicker = inject(LiveTickerService);
  teamIndex = inject(TeamIndexService);

  readonly param = signal<string | null>(null);
  readonly data = signal<LeagueData | null>(null);
  readonly isLoading = signal(true);
  readonly isRefreshing = signal(false);
  readonly failed = signal(false);

  // UI state mirrored in the URL for shareable/bookmarkable deep links.
  readonly tab = signal<Tab>('spiele');
  readonly view = signal<GamesView>('alle');
  readonly teamFilter = signal('');
  readonly scorerSearch = signal('');
  readonly scorerTeam = signal('');
  readonly scorerLimit = signal(SCORER_PAGE);
  readonly sort = signal<{ key: SortKey; dir: 1 | -1 }>({ key: 'place', dir: 1 });

  /** The league as listed in the index (clean name + gender), if known. */
  private readonly indexEntry = signal<LeagueRef | null>(null);
  private holdsTicker = false;
  private loadedAt = 0;
  private stopReturnRefresh?: () => void;
  /** Scroll to the next matchday once after the first load (not on "back"). */
  private jumpPending = this.router.currentNavigation()?.trigger !== 'popstate';

  readonly games = computed(() => this.data()?.games ?? []);
  readonly hasGames = computed(() => this.games().length > 0);
  readonly hasTable = computed(() => (this.data()?.table.length ?? 0) > 0);
  readonly hasScorers = computed(() => (this.data()?.scorers.length ?? 0) > 0);

  readonly tabs = computed(() => [
    ...(this.hasGames() ? [{ id: 'spiele' as Tab, label: 'Spiele' }] : []),
    ...(this.hasTable() ? [{ id: 'tabelle' as Tab, label: 'Tabelle' }] : []),
    ...(this.hasScorers() ? [{ id: 'torschuetzen' as Tab, label: 'Torschützen' }] : [])
  ]);

  /** The requested tab, or the first one that has data. */
  readonly activeTab = computed<Tab | null>(() => {
    const tabs = this.tabs();
    return tabs.find(t => t.id === this.tab())?.id ?? tabs[0]?.id ?? null;
  });

  readonly league = computed<LeagueRef>(() =>
    this.indexEntry() ?? { name: this.data()?.name ?? '', gender: '', link: this.param() ?? '' });

  readonly leagueName = computed(() => this.indexEntry()?.name || this.data()?.name || '');
  readonly isFavorite = computed(() => this.favorites.leagues().some(l => l.name === this.league().name));

  readonly teams = computed(() => {
    const names = new Set<string>();
    for (const g of this.games()) { names.add(g.home); names.add(g.guest); }
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'));
  });

  readonly hasFavoriteTeams = computed(() => {
    const favs = this.teamFavorites.teams();
    return favs.length > 0 && this.teams().some(t => favs.includes(t));
  });

  readonly upcomingCount = computed(() => this.games().filter(g => !isPlayed(g)).length);
  readonly playedCount = computed(() => this.games().filter(g => isPlayed(g)).length);

  readonly visibleGames = computed(() => {
    const view = this.view();
    const team = this.teamFilter();
    const favs = this.teamFavorites.teams();
    return this.games().filter(g =>
      (!team || involves(g, team)) &&
      (view !== 'kommend' || !isPlayed(g)) &&
      (view !== 'ergebnisse' || isPlayed(g)) &&
      (view !== 'meine' || favs.includes(g.home) || favs.includes(g.guest)));
  });

  /** Games grouped by calendar day; results view runs newest first. */
  readonly groups = computed<DayGroup[]>(() => {
    const today = dayKey(new Date());
    const map = new Map<string, DayGroup>();
    for (const game of this.visibleGames()) {
      const date = parseGameDate(game.start);
      const key = date ? dayKey(date) : 'offen';
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          label: date ? dayLabel(date) : 'Termin offen',
          round: game.round ?? '',
          past: !!date && key < today,
          games: []
        };
        map.set(key, group);
      } else if (group.round && game.round && group.round !== game.round) {
        group.round = ''; // several rounds on one day: no single label
      }
      group.games.push(game);
    }
    const groups = [...map.values()];
    for (const g of groups) g.games.sort((a, b) => gameTime(a) - gameTime(b));
    const dir = this.view() === 'ergebnisse' ? -1 : 1;
    return groups.sort((a, b) =>
      a.key === 'offen' ? 1 : b.key === 'offen' ? -1 : dir * a.key.localeCompare(b.key));
  });

  /** First day that is today or later — the place to start reading. */
  readonly nextGroupKey = computed(() => {
    if (this.view() === 'ergebnisse') return null;
    const groups = this.groups();
    const idx = groups.findIndex(g => !g.past && g.key !== 'offen');
    return idx > 0 ? groups[idx].key : null;
  });

  readonly tableRows = computed<TableRow[]>(() => {
    const data = this.data();
    if (!data) return [];
    const favs = this.teamFavorites.teams();
    const { key, dir } = this.sort();
    const value = (row: Table): number | string => {
      if (key === 'goals') return parseInt(String(row.goals).split(':')[0], 10) || 0;
      if (key === 'team') return row.team.toLowerCase();
      return row[key];
    };
    return data.table
      .map(row => ({ ...row, form: formOf(data.games, row.team), favorite: favs.includes(row.team) }))
      .sort((a, b) => {
        const va = value(a), vb = value(b);
        const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'de') : (va as number) - (vb as number);
        return cmp !== 0 ? dir * cmp : a.place - b.place;
      });
  });

  readonly scorerTeams = computed(() =>
    [...new Set((this.data()?.scorers ?? []).map(s => s.team))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'de')));

  readonly scorerRows = computed<ScorerRow[]>(() => {
    const term = this.scorerSearch().trim().toLowerCase();
    const team = this.scorerTeam();
    return (this.data()?.scorers ?? [])
      .filter(s => (!team || s.team === team) &&
        (!term || s.name.toLowerCase().includes(term) || s.team.toLowerCase().includes(term)))
      .map(s => {
        const m = s.name.match(/^(.*?)\s*\((\d{4})\)\s*$/);
        return {
          ...s,
          player: m ? m[1] : s.name,
          year: m ? m[2] : '',
          average: s.games > 0 ? decimal(s.goals / s.games) : '–'
        };
      });
  });

  readonly shownScorers = computed(() => this.scorerRows().slice(0, this.scorerLimit()));

  /** Games of this league that are being played right now. */
  readonly liveCount = computed(() => {
    if (!this.seasonService.isLive()) return 0;
    const keys = this.liveTicker.liveNowKeys();
    if (keys.size === 0) return 0;
    return this.games().filter(g => {
      const ref = parseGameLink(g.gameLink);
      return !!ref && keys.has(gameKey(ref));
    }).length;
  });

  private lastLiveCount = 0;

  constructor() {
    // When a game of this league leaves the ticker's live state it has just
    // ended: fetch the final result without the user having to ask.
    effect(() => {
      const count = this.liveCount();
      untracked(() => {
        if (count < this.lastLiveCount) setTimeout(() => this.refresh(), 4000);
        this.lastLiveCount = count;
      });
    });
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const tab = String(params['tab'] || '').toLowerCase() as Tab;
      this.tab.set(TABS.includes(tab) ? tab : 'spiele');
      const view = String(params['ansicht'] || '').toLowerCase() as GamesView;
      this.view.set(VIEWS.includes(view) ? view : 'alle');
      this.teamFilter.set(params['team'] || '');
      this.scorerSearch.set(params['sf'] || '');

      // Only (re)fetch league data when the league itself changes — not when we
      // ourselves update tab/filter query params.
      const leagueParam = params['param'] || null;
      if (leagueParam !== this.param()) {
        this.param.set(leagueParam);
        if (leagueParam) this.fetchLeague(leagueParam);
        else { this.isLoading.set(false); this.failed.set(true); }
      }
    });

    // Connect to the liveticker for the current season so games that are being
    // played right now are flagged (and show their running score).
    if (this.seasonService.isCurrentSeason) {
      this.holdsTicker = true;
      this.liveTicker.retain();
      // Back in the app after a while: show current results without asking.
      this.stopReturnRefresh = refreshOnReturn(() => this.loadedAt, () => this.refresh());
    }
  }

  ngOnDestroy(): void {
    if (this.holdsTicker) this.liveTicker.release();
    this.stopReturnRefresh?.();
  }

  private fetchLeague(param: string, forceRefresh = false): void {
    // An archive league opened by link: show it in its own season.
    if (HistoryService.isHistoricalLeagueId(param)) this.seasonService.setSeason(param.slice(0, 4));

    // Show what we already know right away; fresh data replaces it when it arrives.
    const known = forceRefresh ? this.data() : this.ligaService.peek(param);
    if (forceRefresh) this.isRefreshing.set(true);
    else {
      this.indexEntry.set(null);
      this.data.set(known);
      this.isLoading.set(!known);
      if (known) this.resolveIndexEntry(param);
    }
    this.failed.set(false);

    this.ligaService.fetchLeagueData(param, forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          if (param !== this.param()) return;
          this.data.set(data);
          this.loadedAt = Date.now();
          this.isLoading.set(false);
          this.isRefreshing.set(false);
          this.title.setTitle(`${this.leagueName() || 'Liga'} – Wasserball Live`);
          if (!this.indexEntry()) this.resolveIndexEntry(param);
          this.jumpToNextOnce();
        },
        error: () => {
          this.isLoading.set(false);
          this.isRefreshing.set(false);
          if (forceRefresh) this.snackBar.open('Aktualisieren fehlgeschlagen');
          else if (!this.data()) this.failed.set(true);
        }
      });
  }

  /**
   * Look the league up in the season index: it has the clean name favourites
   * are matched by (the page header appends the gender).
   */
  private resolveIndexEntry(param: string): void {
    this.overviewService.getItems().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => {
        if (param !== this.param()) return;
        const entry = items.flatMap(i => i.subItems).find(s => s.link === param);
        if (entry) {
          this.indexEntry.set({ name: entry.name, gender: entry.gender, link: entry.link });
          this.title.setTitle(`${entry.name} – Wasserball Live`);
        }
        this.rememberVisit();
      },
      error: () => this.rememberVisit()
    });
  }

  private rememberVisit(): void {
    const league = this.league();
    if (!league.name || !this.seasonService.isCurrentSeason) return;
    this.favorites.addRecent(league);
    for (const team of this.teams()) this.teamFavorites.noteLeague(team, league);
  }

  private jumpToNextOnce(): void {
    if (!this.jumpPending) return;
    this.jumpPending = false;
    if (this.activeTab() !== 'spiele' || this.view() !== 'alle') return;
    const key = this.nextGroupKey();
    if (key) setTimeout(() => this.scrollToDay(key, 'auto'), 0);
  }

  scrollToDay(key: string, behavior: ScrollBehavior = 'smooth'): void {
    document.getElementById('tag-' + key)?.scrollIntoView({ behavior, block: 'start' });
  }

  goBack(): void {
    this.navigation.back('/ligen');
  }

  retry(): void {
    const param = this.param();
    if (param) this.fetchLeague(param);
  }

  /** Re-fetch live data, bypassing the session cache (keeps current content). */
  refresh(): void {
    const param = this.param();
    if (param && !this.isRefreshing()) this.fetchLeague(param, true);
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

  selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.updateUrl({ tab: tab === 'spiele' ? null : tab });
  }

  setView(view: GamesView): void {
    this.view.set(view);
    this.updateUrl({ ansicht: view === 'alle' ? null : view });
  }

  setTeamFilter(team: string): void {
    this.teamFilter.set(team);
    this.updateUrl({ team: team || null });
  }

  private scorerUrlTimer?: ReturnType<typeof setTimeout>;

  onScorerSearch(term: string): void {
    this.scorerSearch.set(term);
    this.scorerLimit.set(SCORER_PAGE);
    clearTimeout(this.scorerUrlTimer);
    this.scorerUrlTimer = setTimeout(() => this.updateUrl({ sf: term.trim() || null }), 400);
  }

  setScorerTeam(team: string): void {
    this.scorerTeam.set(team);
    this.scorerLimit.set(SCORER_PAGE);
  }

  showMoreScorers(): void {
    this.scorerLimit.update(n => n + SCORER_PAGE);
  }

  sortBy(key: SortKey): void {
    const current = this.sort();
    // Text and rank ascend first; everything else starts with the highest value.
    const first: 1 | -1 = key === 'place' || key === 'team' ? 1 : -1;
    this.sort.set(current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: first });
  }

  ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    const s = this.sort();
    return s.key !== key ? 'none' : s.dir === 1 ? 'ascending' : 'descending';
  }

  toggleFavorite(): void {
    const league = this.league();
    if (!league.name) return;
    const now = this.favorites.toggle(league);
    this.tracking.track(now ? 'Favorite Added' : 'Favorite Removed', { leagueName: league.name });
    this.snackBar.open(now ? 'Du folgst dieser Liga' : 'Liga entfernt', 'Rückgängig')
      .onAction().subscribe(() => this.favorites.toggle(league));
  }

  /** Export upcoming games (optionally of one team) as an iCalendar file. */
  exportCalendar(): void {
    const team = this.teamFilter();
    const games = team ? this.games().filter(g => involves(g, team)) : this.games();
    const count = downloadCalendar(games, this.leagueName(), team || this.leagueName());
    this.snackBar.open(count
      ? `${count} ${count === 1 ? 'Termin' : 'Termine'} als Kalenderdatei gespeichert`
      : 'Es stehen keine Spiele mehr an');
  }

  async share(): Promise<void> {
    const shareData = { title: `Wasserball: ${this.leagueName()}`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        this.snackBar.open('Link kopiert');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') this.snackBar.open('Teilen nicht möglich');
    }
  }

  /** Link to the same league on the DSV site (live season only). */
  readonly dsvUrl = computed(() => {
    const param = this.param();
    return param && /League\.aspx/i.test(param) ? 'https://dsvdaten.dsv.de/Modules/WB/' + param : null;
  });

  initial(name: string): string {
    return teamInitial(name);
  }

  formLabel(o: Outcome): string {
    return o === 'W' ? 'S' : o === 'D' ? 'U' : 'N';
  }
}
