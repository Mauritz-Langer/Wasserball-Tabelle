import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LigaService, LeagueData } from '../../services/liga/liga.service';
import { SeasonService } from '../../services/season/season.service';
import { HistoryService } from '../../services/history/history.service';
import { TeamFavoritesService } from '../../services/favorites/team-favorites.service';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { TrackingService } from '../../services/tracking/tracking.service';
import { NavigationService } from '../../services/navigation/navigation.service';
import { Outcome, decimal, formOf, gameTime, involves, isPlayed, parseScore } from '../../models/game-utils';
import { downloadCalendar } from '../../models/ics';
import { GameRowComponent } from '../game-row/game-row.component';
import { LogoFallbackDirective } from '../../directives/logo-fallback.directive';
import { teamInitial } from '../../models/game-utils';
import { TeamIndexService } from '../../services/team-index/team-index.service';

interface Record { played: number; wins: number; draws: number; losses: number; scored: number; conceded: number; }

/**
 * One team within a league: standing, form, fixtures, results and the team's
 * scorers — everything the league page knows about the team, in one place.
 */
@Component({
  selector: 'app-team',
  imports: [RouterLink, MatIcon, GameRowComponent, LogoFallbackDirective],
  templateUrl: './team.component.html',
  styleUrl: './team.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TeamComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  teamIndex = inject(TeamIndexService);
  private title = inject(Title);
  private ligaService = inject(LigaService);
  private snackBar = inject(MatSnackBar);
  private tracking = inject(TrackingService);
  private destroyRef = inject(DestroyRef);
  private navigation = inject(NavigationService);
  private liveTicker = inject(LiveTickerService);
  seasonService = inject(SeasonService);
  teamFavorites = inject(TeamFavoritesService);

  readonly liga = signal<string | null>(null);
  readonly name = signal('');
  readonly data = signal<LeagueData | null>(null);
  readonly isLoading = signal(true);
  readonly failed = signal(false);
  readonly showAllResults = signal(false);
  readonly showAllUpcoming = signal(false);

  private holdsTicker = false;

  readonly isFavorite = computed(() => this.teamFavorites.teams().includes(this.name()));
  readonly row = computed(() => this.data()?.table.find(t => t.team === this.name()) ?? null);
  readonly teamCount = computed(() => this.data()?.table.length ?? 0);

  readonly games = computed(() =>
    (this.data()?.games ?? []).filter(g => involves(g, this.name())));

  readonly logo = computed(() => {
    const name = this.name();
    const game = this.games().find(g => (g.home === name ? g.homeImageUrl : g.guestImageUrl));
    return this.row()?.imageUrl || (game ? (game.home === name ? game.homeImageUrl : game.guestImageUrl) : '')
      || this.teamIndex.logoFor(name);
  });

  readonly upcoming = computed(() =>
    this.games().filter(g => !isPlayed(g)).sort((a, b) => gameTime(a) - gameTime(b)));

  readonly results = computed(() =>
    this.games().filter(g => isPlayed(g)).sort((a, b) => gameTime(b) - gameTime(a)));

  readonly shownUpcoming = computed(() =>
    this.showAllUpcoming() ? this.upcoming() : this.upcoming().slice(0, 4));

  readonly shownResults = computed(() =>
    this.showAllResults() ? this.results() : this.results().slice(0, 5));

  readonly form = computed<Outcome[]>(() => formOf(this.games(), this.name()));

  /** Record computed from the fixtures (covers cups without a table). */
  readonly record = computed<Record>(() => {
    const name = this.name();
    const rec: Record = { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0 };
    for (const g of this.results()) {
      const [h, a] = parseScore(g.result)!;
      const own = g.home === name ? h : a;
      const other = g.home === name ? a : h;
      rec.played++;
      rec.scored += own;
      rec.conceded += other;
      if (own > other) rec.wins++; else if (own < other) rec.losses++; else rec.draws++;
    }
    return rec;
  });

  readonly goalsPerGame = computed(() => {
    const r = this.record();
    return r.played ? decimal(r.scored / r.played) : '–';
  });

  readonly concededPerGame = computed(() => {
    const r = this.record();
    return r.played ? decimal(r.conceded / r.played) : '–';
  });

  readonly scorers = computed(() =>
    (this.data()?.scorers ?? [])
      .filter(s => s.team === this.name())
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 8)
      .map(s => ({ ...s, player: s.name.replace(/\s*\(\d{4}\)\s*$/, '') })));

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const liga = params['liga'] || null;
      this.name.set(params['name'] || '');
      this.title.setTitle(`${this.name() || 'Team'} – Wasserball Live`);
      if (liga !== this.liga()) {
        this.liga.set(liga);
        if (liga) this.load(liga);
        else { this.isLoading.set(false); this.failed.set(true); }
      }
    });
    if (this.seasonService.isCurrentSeason) {
      this.holdsTicker = true;
      this.liveTicker.retain();
    }
  }

  ngOnDestroy(): void {
    if (this.holdsTicker) this.liveTicker.release();
  }

  private load(liga: string): void {
    if (HistoryService.isHistoricalLeagueId(liga)) this.seasonService.setSeason(liga.slice(0, 4));

    const known = this.ligaService.peek(liga);
    this.data.set(known);
    this.isLoading.set(!known);
    this.failed.set(false);
    this.ligaService.fetchLeagueData(liga).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        if (liga !== this.liga()) return;
        this.data.set(data);
        this.isLoading.set(false);
      },
      error: () => { this.isLoading.set(false); if (!this.data()) this.failed.set(true); }
    });
  }

  goBack(): void {
    this.navigation.back('/liga', { param: this.liga(), tab: 'tabelle' });
  }

  retry(): void {
    const liga = this.liga();
    if (liga) this.load(liga);
  }

  toggleFavorite(): void {
    const team = this.name();
    const league = { name: this.data()?.name ?? '', gender: '', link: this.liga() ?? '' };
    this.teamFavorites.toggle(team, this.seasonService.isCurrentSeason ? league : undefined);
    const now = this.teamFavorites.isFavorite(team);
    this.tracking.track(now ? 'Team Favorite Added' : 'Team Favorite Removed', { team });
    this.snackBar.open(now ? `Du folgst ${team}. Die Spiele stehen jetzt auf deiner Startseite.` : `${team} entfernt`, 'Rückgängig')
      .onAction().subscribe(() => this.teamFavorites.toggle(team, league));
  }

  exportCalendar(): void {
    const count = downloadCalendar(this.games(), this.data()?.name ?? '', this.name());
    this.snackBar.open(count
      ? `${count} ${count === 1 ? 'Termin' : 'Termine'} als Kalenderdatei gespeichert`
      : 'Es stehen keine Spiele mehr an');
  }

  initial(name: string): string {
    return teamInitial(name);
  }

  formLabel(o: Outcome): string {
    return o === 'W' ? 'S' : o === 'D' ? 'U' : 'N';
  }
}
