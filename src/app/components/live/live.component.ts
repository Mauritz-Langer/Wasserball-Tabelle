import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { LiveGame } from '../../models/live';
import { Games } from '../../models/games';
import { buildGameLink, buildLeagueLink, liveGameKey, GameRef } from '../../models/game-ref';
import { GameRowComponent } from '../game-row/game-row.component';

interface LiveRow { key: string; game: Games; league: string; ligaParam: string; }

export function liveRef(g: LiveGame): GameRef {
    return {
        season: String(g.Season), leagueId: String(g.LeagueID),
        group: String(g.Gruppe ?? ''), leagueKind: String(g.LeagueKind), gameId: String(g.GameID)
    };
}

/** Present a ticker game as a regular game so it can use the shared row. */
export function liveToGame(g: LiveGame, status: 'live' | 'finished' | 'upcoming', score: string): Games {
    return {
        start: g.StartDate || '',
        home: g.HomeClubname || g.HomeClubnameRaw || 'Heim',
        homeImageUrl: '',
        guest: g.GuestClubname || g.GuestClubnameRaw || 'Gast',
        guestImageUrl: '',
        location: [g.PoolName, g.PoolCity].filter(Boolean).join(', '),
        gameLink: buildGameLink(liveRef(g)),
        result: status === 'upcoming' ? ' - ' : score
    };
}

/**
 * The DSV liveticker as a list: games being played right now, today's
 * upcoming games and final scores. Every row opens the game centre, where the
 * play-by-play runs.
 */
@Component({
    selector: 'app-live',
    imports: [MatIcon, GameRowComponent],
    templateUrl: './live.component.html',
    styleUrl: './live.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LiveComponent implements OnInit, OnDestroy {
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    live = inject(LiveTickerService);

    private rows(status: 'live' | 'finished' | 'upcoming'): LiveRow[] {
        return this.live.liveGames()
            .filter(g => this.live.statusOf(g) === status)
            .sort((a, b) => (a.StartDate || '').localeCompare(b.StartDate || ''))
            .map(g => ({
                key: liveGameKey(g),
                game: liveToGame(g, status, this.live.scoreOf(g)),
                league: g.LeagueNameLive || g.LeagueName || '',
                ligaParam: buildLeagueLink(liveRef(g))
            }));
    }

    readonly liveNow = computed(() => this.rows('live'));
    readonly upcoming = computed(() => this.rows('upcoming'));
    readonly finished = computed(() => this.rows('finished').reverse());
    readonly isEmpty = computed(() => this.live.liveGames().length === 0);

    ngOnInit(): void {
        this.live.retain();

        // Old deep links (/live?game=<key>) open the game centre directly.
        const key = this.route.snapshot.queryParamMap.get('game');
        if (key) {
            const [season, leagueId, group, leagueKind, gameId] = key.split('_');
            if (season && leagueId && leagueKind && gameId) {
                const ref = { season, leagueId, group: group ?? '', leagueKind, gameId };
                this.router.navigate(['/game-details'], {
                    queryParams: { param: buildGameLink(ref), ligaParam: buildLeagueLink(ref) },
                    replaceUrl: true
                });
            }
        }
    }

    ngOnDestroy(): void {
        this.live.release();
    }

    retry(): void {
        this.live.connect();
    }
}
