import { Component, OnInit, OnDestroy, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { LiveGame, LivePlay } from '../../models/live';
import { GameRef, liveGameKey, buildLeagueLink, buildGameLink } from '../../models/game-ref';

type GameStatus = 'live' | 'finished' | 'upcoming';

@Component({
    selector: 'app-live',
    standalone: true,
    imports: [CommonModule, MatIcon, MatIconButton, MatButton, MatProgressSpinner],
    templateUrl: './live.component.html',
    styleUrl: './live.component.scss'
})
export class LiveComponent implements OnInit, OnDestroy {
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    live = inject(LiveTickerService);

    /** Deep-link target ("?game=<key>") to auto-open once games have loaded. */
    private pendingGameKey: string | null = null;

    // Status is derived from the ticker's own status fields, NOT from `Active`
    // (which is always true) or `Period` (always 0 in the games list).
    readonly liveNow = computed(() => this.sortByStart(this.live.liveGames().filter(g => this.statusOf(g) === 'live')));
    readonly upcoming = computed(() => this.sortByStart(this.live.liveGames().filter(g => this.statusOf(g) === 'upcoming')));
    readonly finished = computed(() => this.live.liveGames().filter(g => this.statusOf(g) === 'finished'));

    constructor() {
        // When games arrive (or change), honour a pending ?game= deep link.
        effect(() => {
            const games = this.live.liveGames();
            if (this.pendingGameKey && games.length && !this.live.currentGame()) {
                const key = this.pendingGameKey;
                this.pendingGameKey = null;
                this.live.watchByKey(key);
            }
        });
    }

    ngOnInit(): void {
        this.pendingGameKey = this.route.snapshot.queryParamMap.get('game');
        this.live.connect();
    }

    ngOnDestroy(): void {
        this.live.disconnect();
    }

    goBack(): void {
        if (this.live.currentGame()) {
            this.live.unwatch();
            this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
        } else {
            this.router.navigate(['/']);
        }
    }

    select(game: LiveGame): void {
        this.live.watchGame(game);
        // Make the watched game shareable/bookmarkable.
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { game: liveGameKey(game) },
            replaceUrl: true
        });
    }

    retry(): void {
        this.live.connect();
    }

    // ---- Cross-links to Liga / match report -------------------------------

    private refOf(g: LiveGame): GameRef {
        return {
            season: String(g.Season), leagueId: String(g.LeagueID),
            group: String(g.Gruppe ?? ''), leagueKind: String(g.LeagueKind), gameId: String(g.GameID)
        };
    }

    /** Open the full league page (table/games/scorers) for this game. */
    openLeague(g: LiveGame): void {
        this.router.navigate(['/liga'], { queryParams: { param: buildLeagueLink(this.refOf(g)) } });
    }

    /** Open the full DSV match report for this game. */
    openReport(g: LiveGame): void {
        const ref = this.refOf(g);
        this.router.navigate(['/game-details'], {
            queryParams: { param: buildGameLink(ref), ligaParam: buildLeagueLink(ref) }
        });
    }

    // ---- Status / score helpers -------------------------------------------

    statusOf(g: LiveGame): GameStatus {
        return this.live.statusOf(g);
    }

    score(game: LiveGame): string {
        if (game.ScoreText && game.ScoreText.includes(':')) return game.ScoreText;
        const valid = (n: any) => typeof n === 'number' && n >= 0 && n < 200;
        const h = valid(game.HomeGoalsFinal) ? game.HomeGoalsFinal : (valid(game.HomeGoals) ? game.HomeGoals : 0);
        const g = valid(game.GuestGoalsFinal) ? game.GuestGoalsFinal : (valid(game.GuestGoals) ? game.GuestGoals : 0);
        return `${h}:${g}`;
    }

    /** Per-quarter breakdown, e.g. "(5:4, 2:4, 4:3, 7:3)" -> ["5:4","2:4",…]. */
    quarters(game: LiveGame): string[] {
        const raw = game.ScorePeriods || '';
        const inner = raw.replace(/[()]/g, '').trim();
        if (!inner) return [];
        return inner.split(',').map(s => s.trim()).filter(Boolean);
    }

    /** Friendly kickoff time for upcoming games. */
    kickoff(game: LiveGame): string {
        const short = (game.LiveShortText || '').trim();
        if (/[a-zA-Z]/.test(short)) return short;            // e.g. "So 09:00 Uhr"
        const t = game.StartDate || '';
        const time = t.includes('T') ? t.split('T')[1]?.slice(0, 5) : '';
        return time ? `${time} Uhr` : 'geplant';
    }

    // ---- Play-by-play helpers ---------------------------------------------

    /** Which side an event belongs to (the cap number sits on that side). */
    playSide(p: LivePlay): 'home' | 'guest' | null {
        if (p.GamePlanHome) return 'home';
        if (p.GamePlanGuest) return 'guest';
        return null;
    }

    playCap(p: LivePlay): string {
        return (p.GamePlanHome || p.GamePlanGuest || '').toString();
    }

    isGoal(p: LivePlay): boolean {
        return p.EventKey === 'T';
    }

    eventIcon(p: LivePlay): string {
        switch (p.EventKey) {
            case 'T': return 'sports_handball';   // Tor
            case 'S': return 'sports_score';       // Strafwurf
            case 'A': return 'pan_tool';           // Ausschluss
            case 'AU': case 'KT': return 'timer';  // Auszeit / Timeout
            default: return 'fiber_manual_record';
        }
    }

    eventLabel(p: LivePlay): string {
        const name = (p.EventName || '').replace(/f\.$/, '').trim();
        return name || p.EventKey || '';
    }

    /** "1900-01-01T00:01:02" -> "01:02"; period markers for shootout/extra. */
    eventTime(p: LivePlay): string {
        if (p.Period === 7) return '5m';
        if (p.Period === 8) return 'EW';
        const t = p.EventTime || '';
        const afterT = t.includes('T') ? t.split('T')[1] : t;
        const parts = afterT.split(':');
        return parts.length >= 3 ? `${parts[1]}:${parts[2]}` : afterT;
    }

    private sortByStart(games: LiveGame[]): LiveGame[] {
        return [...games].sort((a, b) => (a.StartDate || '').localeCompare(b.StartDate || ''));
    }

    trackPlay = (_: number, p: LivePlay) => p.Number;
    trackGame = (_: number, g: LiveGame) => `${g.Season}_${g.LeagueID}_${g.Gruppe}_${g.LeagueKind}_${g.GameID}`;
}
