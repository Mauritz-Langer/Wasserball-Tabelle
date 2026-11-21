import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { MatIcon } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GameDetailsService } from '../../services/game-details/game-details.service';
import { HistoryService } from '../../services/history/history.service';
import { LigaService, LeagueData } from '../../services/liga/liga.service';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { SeasonService } from '../../services/season/season.service';
import { TrackingService } from '../../services/tracking/tracking.service';
import { NavigationService } from '../../services/navigation/navigation.service';
import { GameDetails, PlayerStatistics, TeamDetails } from '../../models/game-details';
import { LiveGame, LivePlay } from '../../models/live';
import { Games } from '../../models/games';
import { buildLeagueLink, gameKey, parseGameLink } from '../../models/game-ref';
import { eventIcon, eventLabel, foulLabel, isGoalEvent } from '../../models/event-format';
import {
  Outcome, dayLabel, decimal, formOf, gameTime, hasTime, involves, isPlayed, parseGameDate, parseScore, timeLabel
} from '../../models/game-utils';
import { buildIcs } from '../../models/ics';
import { GameRowComponent } from '../game-row/game-row.component';
import { LogoFallbackDirective } from '../../directives/logo-fallback.directive';
import { teamInitial } from '../../models/game-utils';
import { TeamIndexService } from '../../services/team-index/team-index.service';

type Tab = 'verlauf' | 'aufstellung' | 'vergleich' | 'info';
type Status = 'upcoming' | 'live' | 'finished';
type Side = 'home' | 'guest';

interface TimelineEvent {
  side: Side | null;
  cap: string;
  time: string;
  player: string;
  label: string;
  icon: string;
  goal: boolean;
  score: string;
  retracted?: boolean;
}

interface TimelinePeriod { period: number; label: string; score: string; events: TimelineEvent[]; }
interface CompareRow { label: string; home: string; guest: string; homeShare: number; }
interface LeadChart { path: string; width: number; height: number; zero: number; quarters: number[]; maxLead: number; }
interface TeamContext { name: string; place: number | null; points: number | null; record: string; goals: string; form: Outcome[]; }

const TABS: Tab[] = ['verlauf', 'aufstellung', 'vergleich', 'info'];

/** "1. Viertel", "Verlängerung", "Fünfmeterwerfen" */
function periodLabel(period: number): string {
  if (period >= 1 && period <= 4) return `${period}. Viertel`;
  if (period === 7 || period === 8) return 'Fünfmeterwerfen';
  return 'Verlängerung';
}

/**
 * Game centre: one page for a game in every state. Before kick-off it shows
 * the date, venue and how the two teams compare; while the game runs it shows
 * the live ticker; afterwards the full report with timeline, lineups, team
 * comparison and officials.
 */
@Component({
  selector: 'app-game-details',
  imports: [RouterLink, MatIcon, MatMenuModule, GameRowComponent, LogoFallbackDirective],
  templateUrl: './game-details.component.html',
  styleUrl: './game-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameDetailsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  teamIndex = inject(TeamIndexService);
  private router = inject(Router);
  private title = inject(Title);
  private gameDetailsService = inject(GameDetailsService);
  private historyService = inject(HistoryService);
  private ligaService = inject(LigaService);
  private seasonService = inject(SeasonService);
  private tracking = inject(TrackingService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private destroyRef = inject(DestroyRef);
  private navigation = inject(NavigationService);
  ticker = inject(LiveTickerService);

  readonly param = signal<string | null>(null);
  readonly ligaParam = signal<string | null>(null);
  readonly details = signal<GameDetails | null>(null);
  readonly league = signal<LeagueData | null>(null);
  readonly isLoading = signal(true);
  readonly isRefreshing = signal(false);
  readonly error = signal<string | null>(null);
  /** The DSV page could not be loaded: the game is shown from the liveticker alone. */
  readonly tickerOnly = signal(false);
  readonly tab = signal<Tab | null>(null);
  /** Which lineup is shown on narrow screens. */
  readonly lineupSide = signal<Side>('home');

  private holdsTicker = false;
  private watching = false;
  private wasLive = false;

  // ---- Identity / live state ----------------------------------------------

  private readonly liveKey = computed(() => {
    const ref = parseGameLink(this.param());
    return ref ? gameKey(ref) : '';
  });

  /** The game's ticker entry, if the ticker knows it. */
  readonly tickerGame = computed(() => {
    const key = this.liveKey();
    return key ? this.ticker.byKey().get(key) ?? null : null;
  });

  readonly isLive = computed(() => {
    const g = this.tickerGame();
    return !!g && this.ticker.statusOf(g) === 'live';
  });

  readonly status = computed<Status>(() => {
    if (this.isLive()) return 'live';
    const g = this.tickerGame();
    if (g && this.ticker.statusOf(g) === 'finished') return 'finished';
    const d = this.details();
    if (!d) return 'upcoming';
    const score = parseScore(d.finalScore);
    if (d.events.length > 0 || d.endGameTime || (score && score[0] + score[1] > 0)) return 'finished';
    return 'upcoming';
  });

  readonly score = computed<[number, number] | null>(() => {
    const g = this.tickerGame();
    if (g && this.status() !== 'upcoming' && (this.isLive() || !parseScore(this.details()?.finalScore))) {
      return parseScore(this.ticker.scoreOf(g));
    }
    return this.status() === 'upcoming' ? null : parseScore(this.details()?.finalScore);
  });

  readonly quarters = computed<string[]>(() => {
    const d = this.details();
    if (d?.quarterScores.length && !this.isLive()) return d.quarterScores.map(q => `${q.home}:${q.guest}`);
    const raw = (this.tickerGame()?.ScorePeriods || '').replace(/[()]/g, '').trim();
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
  });

  readonly startDate = computed(() => parseGameDate(this.details()?.startDate));

  readonly whenLabel = computed(() => {
    const d = this.details();
    const date = this.startDate();
    if (!d || !date) return d?.startDate ?? '';
    return hasTime(d.startDate) ? `${dayLabel(date)}, ${timeLabel(date)} Uhr` : dayLabel(date);
  });

  /** Short live label: the pushed game clock, a short ticker status, else "läuft".
   *  Long ticker texts ("Es wurden noch keine Daten eingegeben.") do not fit the board. */
  readonly clock = computed(() => {
    const detail = (this.tickerGame()?.LiveDetailText ?? '').trim();
    return this.ticker.clock() || (detail.length <= 18 ? detail : '') || 'läuft';
  });

  // ---- Timeline -----------------------------------------------------------

  /** Report events grouped by period, in playing order. */
  readonly periods = computed<TimelinePeriod[]>(() => {
    const d = this.details();
    if (!d) return [];
    const byPeriod = new Map<number, TimelineEvent[]>();
    let prev: [number, number] = [0, 0];
    for (const e of d.events) {
      // Period-end markers carry no event and no player.
      if (!e.player && (!e.eventType || e.cap === '0' || e.time === '0:00')) continue;
      const goal = isGoalEvent(e.eventType);
      let side: Side | null = e.side ?? null;
      if (!side && goal) {
        side = e.homeScore > prev[0] ? 'home' : e.guestScore > prev[1] ? 'guest' : null;
      }
      if (goal) prev = [e.homeScore, e.guestScore];
      const list = byPeriod.get(e.period) ?? [];
      list.push({
        side,
        cap: e.cap ?? '',
        time: e.time,
        player: e.player,
        label: eventLabel(e.eventType),
        icon: eventIcon(e.eventType),
        goal,
        score: goal ? `${e.homeScore}:${e.guestScore}` : ''
      });
      byPeriod.set(e.period, list);
    }
    return [...byPeriod.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([period, events]) => {
        const q = d.quarterScores.find(s => s.quarter === period);
        return { period, label: periodLabel(period), score: q ? `${q.home}:${q.guest}` : '', events };
      });
  });

  /** Ticker plays (newest first) while the game is live or has no report yet. */
  readonly livePlays = computed<(TimelineEvent & { period: string; id: number })[]>(() => {
    if (!this.watching && !this.isLive()) return [];
    return this.ticker.plays().map(p => ({
      id: p.Number,
      side: p.GamePlanHome ? 'home' : p.GamePlanGuest ? 'guest' : null,
      cap: String(p.GamePlanHome || p.GamePlanGuest || ''),
      time: this.playTime(p),
      period: p.Period >= 1 && p.Period <= 4 ? `${p.Period}. V` : periodLabel(p.Period).slice(0, 2),
      player: p.GamePlanPlayer || '',
      label: eventLabel(p.EventKey || '') || (p.EventName || '').replace(/f\.$/, '').trim(),
      icon: eventIcon(p.EventKey || ''),
      goal: p.EventKey === 'T',
      score: p.EventKey === 'T' ? (p.LiveGoals || '') : '',
      retracted: p.Active === false
    }));
  });

  /** Show the ticker feed instead of the (still empty) report. */
  readonly showLiveFeed = computed(() =>
    this.livePlays().length > 0 && (this.isLive() || this.periods().length === 0));

  private playTime(p: LivePlay): string {
    const t = p.EventTime || '';
    const afterT = t.includes('T') ? t.split('T')[1] : t;
    const parts = afterT.split(':');
    return parts.length >= 3 ? `${parseInt(parts[1], 10)}:${parts[2]}` : afterT;
  }

  /**
   * Lead over time (home minus guest) as a step line. The DSV clock counts
   * DOWN within each quarter, so elapsed = quarter length − remaining.
   */
  readonly leadChart = computed<LeadChart | null>(() => {
    const d = this.details();
    if (!d) return null;
    const goals = d.events.filter(e => isGoalEvent(e.eventType) && e.period >= 1 && e.period <= 4);
    if (goals.length < 2) return null;

    const seconds = (time: string) => {
      const [m, s] = time.split(':').map(n => parseInt(n, 10));
      return Number.isNaN(m) || Number.isNaN(s) ? null : m * 60 + s;
    };
    let quarter = 8 * 60;
    for (const e of d.events) {
      const s = seconds(e.time);
      if (s !== null && s > quarter) quarter = Math.ceil(s / 60) * 60;
    }
    const total = quarter * 4;
    const points = goals
      .map(e => {
        const remaining = seconds(e.time);
        return remaining === null ? null
          : { t: (e.period - 1) * quarter + (quarter - remaining), lead: e.homeScore - e.guestScore };
      })
      .filter((p): p is { t: number; lead: number } => p !== null)
      .sort((a, b) => a.t - b.t);
    if (points.length < 2) return null;

    const width = 320, height = 96, pad = 6;
    const maxLead = Math.max(2, ...points.map(p => Math.abs(p.lead)));
    const x = (t: number) => +(t / total * width).toFixed(1);
    const y = (lead: number) => +(height / 2 - lead / maxLead * (height / 2 - pad)).toFixed(1);
    let path = `M0 ${y(0)}`;
    let last = 0;
    for (const p of points) {
      path += ` L${x(p.t)} ${y(last)} L${x(p.t)} ${y(p.lead)}`;
      last = p.lead;
    }
    path += ` L${width} ${y(last)}`;
    return { path, width, height, zero: height / 2, quarters: [1, 2, 3].map(q => x(q * quarter)), maxLead };
  });

  // ---- Lineups / comparison ----------------------------------------------

  readonly hasLineups = computed(() => {
    const d = this.details();
    return !!(d?.homeTeam.players?.length || d?.guestTeam.players?.length);
  });

  readonly topScorers = computed(() => {
    const d = this.details();
    if (!d) return [];
    const of = (team: TeamDetails, side: Side) =>
      (team.players ?? []).filter(p => p.goals > 0).map(p => ({ ...p, side }));
    return [...of(d.homeTeam, 'home'), ...of(d.guestTeam, 'guest')]
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 5);
  });

  /** Head-to-head numbers of this game (goals, exclusions, DSV statistics). */
  readonly compareRows = computed<CompareRow[]>(() => {
    const d = this.details();
    if (!d || this.status() === 'upcoming') return [];
    const rows: CompareRow[] = [];
    const add = (label: string, home: number | string, guest: number | string) => {
      const h = parseFloat(String(home)) || 0;
      const g = parseFloat(String(guest)) || 0;
      rows.push({ label, home: String(home), guest: String(guest), homeShare: h + g > 0 ? h / (h + g) * 100 : 50 });
    };
    const count = (side: Side, test: (type: string) => boolean) =>
      d.events.filter(e => e.side === side && test(e.eventType)).length;

    const score = this.score();
    if (score) add('Tore', score[0], score[1]);
    if (d.events.some(e => e.side)) {
      const exclusion = (t: string) => t === 'A' || t.startsWith('AmE');
      add('Ausschlüsse', count('home', exclusion), count('guest', exclusion));
      add('Strafwürfe gegen', count('home', t => t === 'S'), count('guest', t => t === 'S'));
      const timeouts = [count('home', t => t === 'AU' || t === 'TO'), count('guest', t => t === 'AU' || t === 'TO')];
      if (timeouts[0] + timeouts[1] > 0) add('Auszeiten', timeouts[0], timeouts[1]);
    }
    const stats = d.statistics;
    if (stats) {
      for (const key of Object.keys(stats.home.data)) {
        if (key in stats.guest.data) add(key, stats.home.data[key], stats.guest.data[key]);
      }
    }
    return rows;
  });

  /** Where both teams stand in the league (from the league page). */
  readonly teamContext = computed<{ home: TeamContext; guest: TeamContext } | null>(() => {
    const d = this.details();
    const league = this.league();
    if (!d || !league) return null;
    const of = (name: string): TeamContext => {
      const row = league.table.find(t => t.team === name);
      const played = league.games.filter(g => involves(g, name) && isPlayed(g));
      let scored = 0;
      for (const g of played) {
        const [h, a] = parseScore(g.result)!;
        scored += g.home === name ? h : a;
      }
      return {
        name,
        place: row?.place ?? null,
        points: row?.points ?? null,
        record: row ? `${row.wins}–${row.draws}–${row.losses}` : '',
        goals: played.length ? decimal(scored / played.length) : '–',
        form: formOf(league.games, name)
      };
    };
    const ctx = { home: of(d.homeTeam.name), guest: of(d.guestTeam.name) };
    const useful = (c: TeamContext) => c.place !== null || c.form.length > 0;
    return useful(ctx.home) || useful(ctx.guest) ? ctx : null;
  });

  /** Other games between the two teams in this league. */
  readonly meetings = computed<Games[]>(() => {
    const d = this.details();
    const league = this.league();
    if (!d || !league) return [];
    const self = this.param();
    return league.games
      .filter(g => involves(g, d.homeTeam.name) && involves(g, d.guestTeam.name) && g.gameLink !== self)
      .sort((a, b) => gameTime(b) - gameTime(a));
  });

  readonly officials = computed(() => {
    const o = this.details()?.officials;
    if (!o) return [];
    const roles: [keyof typeof o, string][] = [
      ['referee1', 'Schiedsrichter'], ['referee2', 'Schiedsrichter'],
      ['observer1', 'Beobachter'], ['observer2', 'Beobachter'],
      ['secretary1', 'Sekretär'], ['secretary2', 'Sekretär'],
      ['timekeeper1', 'Zeitnehmer'], ['timekeeper2', 'Zeitnehmer'],
      ['goalJudge1', 'Torrichter'], ['goalJudge2', 'Torrichter']
    ];
    return roles.filter(([key]) => !!o[key]).map(([key, role]) => ({ role, name: o[key] as string }));
  });

  // ---- Tabs ---------------------------------------------------------------

  readonly tabs = computed<{ id: Tab; label: string }[]>(() => {
    const out: { id: Tab; label: string }[] = [];
    if (this.periods().length > 0 || this.showLiveFeed() || this.isLive()) out.push({ id: 'verlauf', label: 'Verlauf' });
    if (this.hasLineups()) out.push({ id: 'aufstellung', label: 'Kader' });
    if (this.compareRows().length > 0 || this.teamContext() || this.meetings().length > 0) {
      out.push({ id: 'vergleich', label: 'Vergleich' });
    }
    out.push({ id: 'info', label: 'Infos' });
    return out;
  });

  readonly activeTab = computed<Tab>(() => {
    const tabs = this.tabs();
    return tabs.find(t => t.id === this.tab())?.id ?? tabs[0].id;
  });

  readonly dsvUrl = computed(() => {
    const param = this.param();
    return param && /Game\.aspx/i.test(param) ? 'https://dsvdaten.dsv.de/Modules/WB/' + param : null;
  });

  constructor() {
    // The DSV page often fails exactly while games are on (it throttles
    // bursts). The liveticker runs on another server: if it knows the game,
    // show the game from it instead of an error.
    effect(() => {
      const game = this.tickerGame();
      if (!game || !this.error() || this.details()) return;
      untracked(() => {
        this.details.set(detailsFromTicker(game));
        this.error.set(null);
        this.tickerOnly.set(true);
      });
    });

    // Follow the game in the ticker as soon as (and as long as) it is live.
    effect(() => {
      const key = this.liveKey();
      const live = this.isLive();
      untracked(() => {
        if (live && key && !this.watching) {
          this.watching = true;
          this.ticker.watchByKey(key);
        }
        // Final whistle: load the official report with lineups and statistics.
        if (!live && this.wasLive) setTimeout(() => this.refresh(), 5000);
        this.wasLive = live;
      });
    });
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const tab = String(params['tab'] || '').toLowerCase() as Tab;
      this.tab.set(TABS.includes(tab) ? tab : null);

      const param = params['param'] || null;
      if (param === this.param()) return;
      this.param.set(param);
      this.stopWatching();

      const ref = parseGameLink(param);
      // Archive game ids end with the game number: the rest is the league id
      // ("2025_297_P_10" -> "2025_297_P"). Show the game in its own season.
      const archived = !!param && HistoryService.isHistoricalGameId(param);
      if (archived) this.seasonService.setSeason(param.slice(0, 4));
      this.ligaParam.set(params['ligaParam']
        || (ref ? buildLeagueLink(ref) : archived ? param.replace(/_[^_]+$/, '') : null));

      if (param) {
        this.loadGameDetails(param);
      } else {
        this.error.set('Kein Spiel angegeben.');
        this.isLoading.set(false);
      }

      // Only games of the running season can be in the ticker.
      if (ref && ref.season === this.seasonService.liveSeason() && !this.holdsTicker) {
        this.holdsTicker = true;
        this.ticker.retain();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopWatching();
    if (this.holdsTicker) this.ticker.release();
  }

  private stopWatching(): void {
    if (this.watching) {
      this.watching = false;
      this.ticker.unwatch();
    }
  }

  // ---- Loading ------------------------------------------------------------

  private loadGameDetails(link: string, refresh = false): void {
    if (refresh) this.isRefreshing.set(true);
    else { this.isLoading.set(true); this.details.set(null); this.league.set(null); }
    this.error.set(null);

    const done = (details: GameDetails | null, message?: string) => {
      if (link !== this.param()) return;
      this.isLoading.set(false);
      this.isRefreshing.set(false);
      if (!details) {
        if (refresh) this.snackBar.open('Aktualisieren fehlgeschlagen');
        else this.error.set(message ?? 'Das Spiel konnte nicht geladen werden.');
        return;
      }
      this.details.set(details);
      this.tickerOnly.set(false);
      this.title.setTitle(`${details.homeTeam.name} – ${details.guestTeam.name} – Wasserball Live`);
      if (!refresh) {
        this.tracking.track('Game Details Viewed', {
          gameId: details.gameId,
          league: details.league,
          homeTeam: details.homeTeam.name,
          guestTeam: details.guestTeam.name,
        });
        this.loadLeagueContext();
      }
    };

    // Historical games (id like "2014_6_2") are served from the local database;
    // games of the running season are read from the DSV website.
    if (HistoryService.isHistoricalGameId(link)) {
      this.historyService.getGameDetails(link)
        .then(d => done(d, 'Für dieses Archiv-Spiel sind keine Details gespeichert.'))
        .catch(() => done(null));
      return;
    }

    this.gameDetailsService.getGameData(link).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: html => {
        try {
          const details = this.gameDetailsService.parseHtmlToGameDetails(html);
          done(details.homeTeam.name || details.guestTeam.name ? details : null,
            'Dieses Spiel gibt es beim DSV nicht (mehr).');
        } catch (error) {
          console.error('Error parsing game details:', error);
          done(null);
        }
      },
      error: (e: { status?: number }) => done(null, e?.status === 429
        ? 'Die DSV-Seite bremst gerade, weil sehr viele Anfragen kommen. In einer Minute klappt es meist wieder.'
        : undefined)
    });
  }

  /** League data adds standings, form and earlier meetings (best effort). */
  private loadLeagueContext(): void {
    const liga = this.ligaParam();
    if (!liga) return;
    this.ligaService.fetchLeagueData(liga).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => { if (liga === this.ligaParam()) this.league.set(data); },
      error: () => { /* the report works without it */ }
    });
  }

  retry(): void {
    const param = this.param();
    // While the ticker fills in, keep showing it and only swap in the report.
    if (param) this.loadGameDetails(param, this.tickerOnly());
  }

  refresh(): void {
    const param = this.param();
    if (param && !this.isRefreshing()) this.loadGameDetails(param, true);
  }

  // ---- Navigation / actions ----------------------------------------------

  selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.router.navigate([], {
      relativeTo: this.route, queryParams: { tab }, queryParamsHandling: 'merge', replaceUrl: true
    });
  }

  /** Back to where the user came from; deep links fall back to the league. */
  goBack(): void {
    if (this.ligaParam()) this.navigation.back('/liga', { param: this.ligaParam() });
    else this.navigation.back('/');
  }

  async shareGame(): Promise<void> {
    const d = this.details();
    if (!d) return;
    this.tracking.track('Game Shared', { gameId: d.gameId, league: d.league });
    const score = this.score();
    const title = `${d.homeTeam.name} – ${d.guestTeam.name}`;
    const text = this.status() === 'upcoming' || !score
      ? `${title}, ${this.whenLabel()} (${d.league})`
      : `${title} ${score[0]}:${score[1]} (${d.league})`;
    const shareData = { title, text, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(`${text}\n${shareData.url}`);
        this.snackBar.open('Link kopiert');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') this.snackBar.open('Teilen nicht möglich');
    }
  }

  /** Result graphic for social media; the generator loads on demand. */
  async openShareImageDialog(): Promise<void> {
    const d = this.details();
    if (!d) return;
    this.tracking.track('Share Image Generated', { gameId: d.gameId, league: d.league });
    const { ShareImageComponent } = await import('../share-image/share-image.component');
    const score = this.score();
    this.dialog.open(ShareImageComponent, {
      width: '90vw',
      maxWidth: '500px',
      data: {
        homeTeam: { name: d.homeTeam.name, logo: d.homeTeam.logoUrl },
        guestTeam: { name: d.guestTeam.name, logo: d.guestTeam.logoUrl },
        finalScore: score ? `${score[0]}:${score[1]}` : '0:0',
        gameDate: this.startDate(),
        gameLocation: [d.venue.poolName, d.venue.poolCity].filter(Boolean).join(', '),
        league: d.league,
        quarterScores: d.quarterScores,
        isFutureGame: this.status() === 'upcoming',
        statusLabel: this.status() === 'live' ? 'Zwischenstand' : 'Endstand'
      }
    });
  }

  addToCalendar(): void {
    const d = this.details();
    if (!d) return;
    const game: Games = {
      start: d.startDate, home: d.homeTeam.name, homeImageUrl: '', guest: d.guestTeam.name, guestImageUrl: '',
      location: [d.venue.poolName, d.venue.poolCity].filter(Boolean).join(', '), gameLink: '', result: ''
    };
    const blob = new Blob([buildIcs([game], d.league)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${d.homeTeam.name}-${d.guestTeam.name}.ics`.replace(/[^\wäöüÄÖÜß.-]+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
    this.snackBar.open('Termin als Kalenderdatei gespeichert');
  }

  trackLink(destination: string): void {
    this.tracking.track('External Link Clicked', { destination });
  }

  // ---- Template helpers ---------------------------------------------------

  /** Caps 1 and 13 are worn by the goalkeepers (red). */
  isKeeper(number: string): boolean {
    return number === '1' || number === '13';
  }

  foulText(player: PlayerStatistics): string {
    return player.fouls.map(f => `${foulLabel(f.foulType)} im ${f.quarter}. Viertel`).join(', ');
  }

  staff(team: TeamDetails): { role: string; name: string }[] {
    const rows: [string, string | undefined][] = [
      ['Trainer', team.coach], ['Kapitän', team.captain], ['Betreuer', team.assistant],
      ['Mannschaftsbegleiter', team.teamLeader ?? team.companionLeader], ['Beste Spielerin / bester Spieler', team.bestPlayer]
    ];
    return rows.filter(([, name]) => !!name).map(([role, name]) => ({ role, name: name as string }));
  }

  goalsOf(team: TeamDetails): number {
    return (team.players ?? []).reduce((sum, p) => sum + (p.goals || 0), 0);
  }

  formLabel(o: Outcome): string {
    return o === 'W' ? 'S' : o === 'D' ? 'U' : 'N';
  }

  initial(name: string): string {
    return teamInitial(name);
  }
}

/** Minimal game report from a liveticker entry (when the DSV page is unavailable). */
export function detailsFromTicker(g: LiveGame): GameDetails {
  const team = (name?: string) => ({ name: name || '', logoUrl: '' });
  const quarterScores = (g.ScorePeriods || '').replace(/[()]/g, '').split(',')
    .map(s => s.trim().match(/^(\d+)\s*:\s*(\d+)$/)).filter((m): m is RegExpMatchArray => !!m)
    .map((m, i) => ({ quarter: i + 1, home: +m[1], guest: +m[2] }));
  return {
    gameId: String(g.GameIDShow || g.GameID),
    league: g.LeagueNameLive || g.LeagueName || '',
    startDate: g.StartDate || '', // ISO, parseGameDate reads it
    playKind: '',
    homeTeam: team(g.HomeClubname),
    guestTeam: team(g.GuestClubname),
    finalScore: '',
    quarterScores,
    venue: { poolName: g.PoolName || '', poolCity: g.PoolCity || '', googleMapsLink: '' },
    officials: {},
    events: []
  };
}
