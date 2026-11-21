import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, catchError, from, map, mergeMap, of, toArray } from 'rxjs';
import { Games } from '../../models/games';
import { SubItem } from '../../models/subItem';
import { LigaService, LeagueData } from '../../services/liga/liga.service';
import { OverviewService } from '../../services/overview/overview.service';
import { SeasonService } from '../../services/season/season.service';
import { FavoritesService, LeagueRef } from '../../services/favorites/favorites.service';
import { TeamFavoritesService } from '../../services/favorites/team-favorites.service';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { buildLeagueLink, liveGameKey, parseGameLink, gameKey } from '../../models/game-ref';
import { dayLabel, gameTime, hasTime, isPlayed, parseGameDate, parseScore, refreshOnReturn, teamInitial, timeLabel } from '../../models/game-utils';
import { GameRowComponent } from '../game-row/game-row.component';
import { liveRef, liveToGame } from '../live/live.component';
import { LogoFallbackDirective } from '../../directives/logo-fallback.directive';
import { TeamIndexService } from '../../services/team-index/team-index.service';

interface FeedGame { game: Games; league: string; ligaParam: string; }
interface LoadedLeague { ref: LeagueRef; data: LeagueData | null; }

/** How many leagues the feed loads at most (each is one request). */
const MAX_FEED_LEAGUES = 8;

/**
 * Start page: what is on right now and what matters to this user — live
 * games, the next game and latest results of followed teams and leagues.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, MatIcon, GameRowComponent, LogoFallbackDirective],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnDestroy {
  private ligaService = inject(LigaService);
  private overviewService = inject(OverviewService);
  private snackBar = inject(MatSnackBar);
  seasonService = inject(SeasonService);
  favorites = inject(FavoritesService);
  teamFavorites = inject(TeamFavoritesService);
  ticker = inject(LiveTickerService);
  teamIndex = inject(TeamIndexService);

  readonly loaded = signal<LoadedLeague[]>([]);
  readonly isLoading = signal(false);
  readonly suggestions = signal<SubItem[]>([]);

  private feedSub?: Subscription;
  private holdsTicker = false;
  private loadedAt = 0;
  private stopReturnRefresh?: () => void;

  /** Leagues the feed draws from: followed leagues + leagues of followed teams. */
  readonly feedLeagues = computed<LeagueRef[]>(() => {
    const byLink = new Map<string, LeagueRef>();
    for (const l of this.favorites.leagues()) if (l.link) byLink.set(l.link, l);
    const contexts = this.teamFavorites.teamLeagues();
    for (const team of this.teamFavorites.teams()) {
      for (const l of contexts[team] ?? []) if (l.link && !byLink.has(l.link)) byLink.set(l.link, l);
    }
    return [...byLink.values()].slice(0, MAX_FEED_LEAGUES);
  });

  readonly hasFollows = computed(() =>
    this.favorites.leagues().length > 0 || this.teamFavorites.teams().length > 0);

  /** Recently opened leagues that are not followed anyway. */
  readonly recent = computed(() =>
    this.favorites.recent().filter(r => !this.favorites.isFavorite(r.name)).slice(0, 4));

  private readonly allGames = computed<FeedGame[]>(() => {
    const seen = new Set<string>();
    const out: FeedGame[] = [];
    for (const { ref, data } of this.loaded()) {
      for (const game of data?.games ?? []) {
        const id = game.gameLink || `${ref.link}|${game.home}|${game.guest}|${game.start}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ game, league: ref.name || data!.name, ligaParam: ref.link });
      }
    }
    return out;
  });

  /** Followed teams that actually appear in the loaded leagues. */
  private readonly myTeams = computed(() => {
    const favs = new Set(this.teamFavorites.teams());
    const present = new Set<string>();
    for (const { game } of this.allGames()) {
      if (favs.has(game.home)) present.add(game.home);
      if (favs.has(game.guest)) present.add(game.guest);
    }
    return present;
  });

  readonly teamMode = computed(() => this.myTeams().size > 0);

  private readonly relevant = computed(() => {
    const teams = this.myTeams();
    return teams.size
      ? this.allGames().filter(f => teams.has(f.game.home) || teams.has(f.game.guest))
      : this.allGames();
  });

  readonly upcoming = computed(() => {
    // A game counts as upcoming until two hours after kick-off (it may be running).
    const cutoff = Date.now() - 2 * 3_600_000;
    return this.relevant()
      .filter(f => !isPlayed(f.game) && gameTime(f.game) > cutoff)
      .sort((a, b) => gameTime(a.game) - gameTime(b.game))
      .slice(0, 6);
  });

  readonly results = computed(() =>
    this.relevant()
      .filter(f => isPlayed(f.game))
      .sort((a, b) => gameTime(b.game) - gameTime(a.game))
      .slice(0, 5));

  /** The single most relevant game: shown large at the top. */
  readonly spotlight = computed(() => this.upcoming()[0] ?? null);
  readonly furtherUpcoming = computed(() => this.upcoming().slice(1));

  readonly spotlightLive = computed(() => {
    const ref = parseGameLink(this.spotlight()?.game.gameLink);
    const entry = ref ? this.ticker.byKey().get(gameKey(ref)) : undefined;
    return entry && this.ticker.statusOf(entry) === 'live' ? parseScore(this.ticker.scoreOf(entry)) : null;
  });

  readonly spotlightWhen = computed(() => {
    const game = this.spotlight()?.game;
    const date = parseGameDate(game?.start);
    if (!game || !date) return game?.start ?? '';
    return hasTime(game.start) ? `${dayLabel(date)}, ${timeLabel(date)} Uhr` : dayLabel(date);
  });

  /** Games in the water right now (all leagues), followed ones first. */
  readonly liveNow = computed<FeedGame[]>(() => {
    const mine = new Set(this.feedLeagues().map(l => l.link));
    return this.ticker.liveGames()
      .filter(g => this.ticker.statusOf(g) === 'live')
      .map(g => {
        const ligaParam = buildLeagueLink(liveRef(g));
        return {
          game: liveToGame(g, 'live', this.ticker.scoreOf(g)),
          league: g.LeagueNameLive || g.LeagueName || '',
          ligaParam,
          key: liveGameKey(g),
          mine: mine.has(ligaParam)
        };
      })
      .sort((a, b) => Number(b.mine) - Number(a.mine))
      .slice(0, 4);
  });

  readonly liveTotal = computed(() => this.ticker.liveNowKeys().size);

  /** Followed teams as chips: logo and, if known, the day of the next game. */
  readonly teamChips = computed(() => {
    const data = this.loaded().map(l => l.data).filter((d): d is LeagueData => !!d);
    const cutoff = Date.now() - 2 * 3_600_000;
    return this.teamFavorites.teams().map(name => {
      let logo = '';
      let next: Games | undefined;
      for (const d of data) {
        logo ||= d.table.find(t => t.team === name)?.imageUrl
          || d.games.find(g => g.home === name)?.homeImageUrl
          || d.games.find(g => g.guest === name)?.guestImageUrl || '';
        for (const g of d.games) {
          if ((g.home === name || g.guest === name) && !isPlayed(g) && gameTime(g) > cutoff
            && (!next || gameTime(g) < gameTime(next))) next = g;
        }
      }
      const date = next ? parseGameDate(next.start) : null;
      const league = this.teamFavorites.teamLeagues()[name]?.[0];
      return { name, logo, liga: league?.link ?? null, when: date ? dayLabel(date) : '' };
    });
  });

  /** Followed leagues with their current leader (once loaded). */
  readonly myLeagues = computed(() => {
    const loaded = new Map(this.loaded().map(l => [l.ref.link, l.data]));
    return this.favorites.leagues().map(ref => {
      const top = loaded.get(ref.link)?.table.find(t => t.place === 1);
      return { ref, leader: top ? `${top.team} führt mit ${top.points} Punkten` : '' };
    });
  });

  constructor() {
    // Reload the feed whenever the set of followed leagues changes.
    effect(() => {
      const leagues = this.feedLeagues();
      const live = this.seasonService.isLive();
      untracked(() => this.loadFeed(live ? leagues : []));
    });

    // Without follows, suggest the national leagues as a starting point.
    effect(() => {
      if (this.hasFollows() || !this.seasonService.isLive()) return;
      untracked(() => this.overviewService.getItems().subscribe({
        next: items => this.suggestions.set((items[0]?.subItems ?? []).slice(0, 4)),
        error: () => this.suggestions.set([])
      }));
    });

    if (this.seasonService.isCurrentSeason) {
      this.holdsTicker = true;
      this.ticker.retain();
      this.stopReturnRefresh = refreshOnReturn(() => this.loadedAt, () => this.loadFeed(this.feedLeagues()));
    }
  }

  ngOnDestroy(): void {
    this.feedSub?.unsubscribe();
    this.stopReturnRefresh?.();
    if (this.holdsTicker) this.ticker.release();
  }

  private loadFeed(leagues: LeagueRef[]): void {
    this.feedSub?.unsubscribe();
    if (!leagues.length) {
      this.loaded.set([]);
      this.isLoading.set(false);
      return;
    }
    // Start from what this session already knows (instant when coming back).
    const known = leagues
      .map(ref => ({ ref, data: this.ligaService.peek(ref.link) }))
      .filter(l => l.data !== null);
    if (known.length) this.loaded.set(known);
    this.isLoading.set(known.length === 0);
    // Two leagues at a time: quick enough, and no burst against the DSV server.
    this.feedSub = from(leagues).pipe(
      mergeMap(ref => this.ligaService.fetchLeagueData(ref.link).pipe(
        map(data => ({ ref, data }) as LoadedLeague),
        catchError(() => of({ ref, data: null } as LoadedLeague))
      ), 2),
      toArray()
    ).subscribe(loaded => {
      const order = new Map(leagues.map((l, i) => [l.link, i]));
      this.loaded.set(loaded.sort((a, b) => order.get(a.ref.link)! - order.get(b.ref.link)!));
      this.loadedAt = Date.now();
      this.isLoading.set(false);
    });
  }

  follow(league: SubItem): void {
    this.favorites.toggle(league);
    this.snackBar.open('Liga gemerkt');
  }

  initial(name: string): string {
    return teamInitial(name);
  }
}
