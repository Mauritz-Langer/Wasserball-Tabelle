import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, catchError, from, map, mergeMap, of } from 'rxjs';
import { Games } from '../../models/games';
import { SubItem } from '../../models/subItem';
import { LigaService, LeagueData } from '../../services/liga/liga.service';
import { OverviewService } from '../../services/overview/overview.service';
import { SeasonService } from '../../services/season/season.service';
import { FavoritesService, LeagueRef } from '../../services/favorites/favorites.service';
import { TeamFavoritesService } from '../../services/favorites/team-favorites.service';
import { dayLabel, gameTime, hasTime, involves, isPlayed, outcomeFor, parseGameDate, teamInitial, timeLabel } from '../../models/game-utils';
import { LogoFallbackDirective } from '../../directives/logo-fallback.directive';
import { TeamIndexService, TeamRow, teamRows } from '../../services/team-index/team-index.service';

interface TeamOption { name: string; logo: string; place: number | null; }
interface FollowedTeam {
  name: string;
  logo: string;
  league: LeagueRef | null;
  next: string;
  last: string;
  lastOutcome: 'W' | 'D' | 'L' | null;
}

/** Leagues whose data this page loads at most (one request each). */
const MAX_LEAGUES = 8;

/**
 * "Meine Teams": the teams a user follows, with their next game, and the place
 * to follow more — suggested from the user's leagues, or picked from any
 * league of the season.
 */
@Component({
  selector: 'app-teams',
  imports: [RouterLink, FormsModule, MatIcon, LogoFallbackDirective],
  templateUrl: './teams.component.html',
  styleUrl: './teams.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TeamsComponent implements OnInit, OnDestroy {
  private ligaService = inject(LigaService);
  private overviewService = inject(OverviewService);
  private snackBar = inject(MatSnackBar);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  seasonService = inject(SeasonService);
  favorites = inject(FavoritesService);
  teamFavorites = inject(TeamFavoritesService);
  teamIndex = inject(TeamIndexService);

  /** League data by league link (followed teams' leagues, my leagues, picked league). */
  readonly loaded = signal<Map<string, LeagueData>>(new Map());
  readonly leagues = signal<SubItem[]>([]);
  readonly query = signal('');
  readonly picked = signal<LeagueRef | null>(null);
  readonly pickedLoading = signal(false);
  readonly pickedFailed = signal(false);
  /** Teams matching the search (by name, from the archive's team index). */
  readonly teamHits = signal<TeamRow[]>([]);
  /** Team whose league is being looked up after tapping a search hit. */
  readonly resolving = signal<string | null>(null);
  /** Came here from the start page: offer the way back once a team is followed. */
  readonly fromStart = signal(false);
  private searchTimer?: ReturnType<typeof setTimeout>;

  private subs: Subscription[] = [];

  /** Leagues to load for the list and the suggestions. */
  private readonly contextLeagues = computed<LeagueRef[]>(() => {
    const byLink = new Map<string, LeagueRef>();
    const ctx = this.teamFavorites.teamLeagues();
    for (const team of this.teamFavorites.teams()) for (const l of ctx[team] ?? []) if (l.link) byLink.set(l.link, l);
    for (const l of [...this.favorites.leagues(), ...this.favorites.recent()]) if (l.link && !byLink.has(l.link)) byLink.set(l.link, l);
    return [...byLink.values()].slice(0, MAX_LEAGUES);
  });

  private teamsOf(data: LeagueData): TeamOption[] {
    const out = new Map<string, TeamOption>();
    for (const row of data.table) out.set(row.team, { name: row.team, logo: row.imageUrl, place: row.place });
    for (const g of data.games) {
      if (g.home && !out.has(g.home)) out.set(g.home, { name: g.home, logo: g.homeImageUrl, place: null });
      if (g.guest && !out.has(g.guest)) out.set(g.guest, { name: g.guest, logo: g.guestImageUrl, place: null });
    }
    const list = [...out.values()];
    return list.some(t => t.place !== null)
      ? list.sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
      : list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  /** Followed teams with logo, league and next / last game. */
  readonly followed = computed<FollowedTeam[]>(() => {
    const loaded = this.loaded();
    const ctx = this.teamFavorites.teamLeagues();
    const now = Date.now() - 2 * 3_600_000;
    return this.teamFavorites.teams().map(name => {
      const leagues = ctx[name] ?? [];
      const games: Games[] = [];
      let logo = '';
      for (const l of leagues) {
        const data = loaded.get(l.link);
        if (!data) continue;
        games.push(...data.games.filter(g => involves(g, name)));
        logo ||= this.teamsOf(data).find(t => t.name === name)?.logo ?? '';
      }
      const next = games.filter(g => !isPlayed(g) && gameTime(g) > now).sort((a, b) => gameTime(a) - gameTime(b))[0];
      const last = games.filter(g => isPlayed(g)).sort((a, b) => gameTime(b) - gameTime(a))[0];
      return {
        name, logo, league: leagues[0] ?? null,
        next: next ? `${this.when(next)} ${next.home === name ? 'gegen' : 'bei'} ${next.home === name ? next.guest : next.home}` : '',
        last: last ? `${last.home === name ? 'gegen' : 'bei'} ${last.home === name ? last.guest : last.home} ${last.result.trim()}` : '',
        lastOutcome: last ? outcomeFor(last, name) : null
      };
    });
  });

  /** Teams of the user's leagues that are not followed yet. */
  readonly suggestions = computed(() => {
    const loaded = this.loaded();
    const followed = new Set(this.teamFavorites.teams());
    const picked = this.picked()?.link;
    return this.contextLeagues()
      .filter(l => l.link !== picked && loaded.has(l.link))
      .map(l => ({ league: l, teams: this.teamsOf(loaded.get(l.link)!).filter(t => !followed.has(t.name)) }))
      .filter(s => s.teams.length > 0);
  });

  readonly pickedTeams = computed(() => {
    const p = this.picked();
    const data = p ? this.loaded().get(p.link) : undefined;
    return data ? this.teamsOf(data) : [];
  });

  readonly leagueMatches = computed(() => {
    const q = this.query().toLowerCase().trim();
    if (q.length < 2) return [];
    return this.leagues().filter(l => l.name.toLowerCase().includes(q)).slice(0, 8);
  });

  ngOnInit(): void {
    this.fromStart.set(this.route.snapshot.queryParamMap.get('von') === 'start');
    if (this.seasonService.isLive()) {
      this.overviewService.getItems().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: items => {
          this.leagues.set(items.flatMap(i => i.subItems));
          const wanted = this.route.snapshot.queryParamMap.get('liga');
          const match = wanted ? this.leagues().find(l => l.link === wanted) : undefined;
          if (match) this.pick(match);
        },
        error: () => this.leagues.set([])
      });
    }
    this.load(this.contextLeagues());
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  /** Load leagues (two at a time), showing cached data at once. */
  private load(leagues: LeagueRef[]): void {
    const known = new Map(this.loaded());
    for (const l of leagues) {
      const cached = this.ligaService.peek(l.link);
      if (cached) known.set(l.link, cached);
    }
    this.loaded.set(known);
    this.subs.push(from(leagues).pipe(
      mergeMap(l => this.ligaService.fetchLeagueData(l.link).pipe(
        map(data => ({ link: l.link, data })),
        catchError(() => of(null))
      ), 2)
    ).subscribe(r => {
      if (!r) return;
      const next = new Map(this.loaded());
      next.set(r.link, r.data);
      this.loaded.set(next);
    }));
  }

  onSearch(text: string): void {
    this.query.set(text);
    clearTimeout(this.searchTimer);
    if (text.trim().length < 2) { this.teamHits.set([]); return; }
    this.searchTimer = setTimeout(async () => {
      const hits = await this.teamIndex.search(text, this.leagues());
      if (this.query() === text) this.teamHits.set(teamRows(hits, 8));
    }, 200);
  }

  /** Follow a team found by name in the league of that result line. */
  async followHit(row: TeamRow): Promise<void> {
    const key = row.team + '|' + (row.league?.link ?? '');
    if (this.isFollowed(row.team)) { this.toggle(row.team, null); return; }
    if (!row.league) {
      this.snackBar.open(`Für ${row.team} hat in dieser Saison noch keine Liga begonnen.`, 'OK');
      return;
    }
    const league = row.league;
    this.resolving.set(key);
    try {
      const data = await new Promise<LeagueData>((resolve, reject) =>
        this.ligaService.fetchLeagueData(league.link).subscribe({ next: resolve, error: reject }));
      const next = new Map(this.loaded());
      next.set(league.link, data);
      this.loaded.set(next);
      if (!this.teamsOf(data).some(t => t.name === row.team)) {
        // Same competition, other group: let the user pick from the league.
        this.pick(league);
        this.snackBar.open(`${row.team} steht nicht in dieser Gruppe. Wähle dein Team unten aus.`, 'OK');
        return;
      }
      this.query.set('');
      this.teamHits.set([]);
      this.toggle(row.team, { name: league.name, gender: league.gender ?? '', link: league.link });
    } catch {
      this.snackBar.open('Die Liga konnte nicht geladen werden. Versuche es noch einmal.', 'OK');
    } finally {
      this.resolving.set(null);
    }
  }

  rowKey(row: TeamRow): string {
    return row.team + '|' + (row.league?.link ?? '');
  }

  pick(league: SubItem | LeagueRef): void {
    const ref: LeagueRef = { name: league.name, gender: league.gender ?? '', link: league.link };
    this.picked.set(ref);
    this.query.set('');
    this.pickedFailed.set(false);
    this.router.navigate([], { relativeTo: this.route, queryParams: { liga: ref.link }, replaceUrl: true });
    if (this.loaded().has(ref.link)) return;
    this.pickedLoading.set(true);
    this.subs.push(this.ligaService.fetchLeagueData(ref.link).subscribe({
      next: data => {
        const next = new Map(this.loaded());
        next.set(ref.link, data);
        this.loaded.set(next);
        this.pickedLoading.set(false);
      },
      error: () => { this.pickedLoading.set(false); this.pickedFailed.set(true); }
    }));
  }

  clearPick(): void {
    this.picked.set(null);
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  isFollowed(team: string): boolean {
    return this.teamFavorites.teams().includes(team);
  }

  toggle(team: string, league: LeagueRef | null): void {
    const following = this.isFollowed(team);
    this.teamFavorites.toggle(team, league ?? undefined);
    if (!following && league && !this.loaded().has(league.link)) this.load([league]);
    this.snackBar.open(following ? `${team} entfernt` : `Du folgst ${team}`, 'Rückgängig')
      .onAction().subscribe(() => this.teamFavorites.toggle(team, league ?? undefined));
  }

  private when(g: Games): string {
    const d = parseGameDate(g.start);
    if (!d) return g.start;
    return hasTime(g.start) ? `${dayLabel(d)}, ${timeLabel(d)} Uhr` : dayLabel(d);
  }

  initial(name: string): string {
    return teamInitial(name);
  }
}
