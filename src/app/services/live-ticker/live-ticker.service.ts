import { Injectable, computed, signal } from '@angular/core';
import { LiveGame, LivePlay, LiveConnectionState } from '../../models/live';
import { liveGameKey } from '../../models/game-ref';

/**
 * Real-time client for the DSV Wasserball liveticker.
 *
 * The ticker is an ASP.NET **SignalR 2.x** hub (`wbhub`) on lizenz.dsv.de. The
 * modern @microsoft/signalr client speaks a different protocol and would not
 * work, so this implements the SignalR 2.x **longPolling** transport by hand —
 * plain HTTP requests proxied same-origin through `/live-api` (lizenz.dsv.de
 * sends no CORS headers). The connectionToken carries all state, so no cookies
 * are needed.
 *
 * Server methods: getAllGames, getGamePlan, getGameStats, getLeagueTable.
 * Server→client pushes: gameTime, addPlay, updatePlay, updateGame.
 */
@Injectable({ providedIn: 'root' })
export class LiveTickerService {
    private readonly base = '/live-api/signalr';
    private readonly connectionData = JSON.stringify([{ name: 'wbhub' }]);

    private connectionToken: string | null = null;
    private messageId: string | null = null;
    private invocationId = 0;
    private pollAbort: AbortController | null = null;
    private running = false;

    /** Connection lifecycle state. */
    readonly state = signal<LiveConnectionState>('idle');
    /** All currently live / upcoming games from the ticker. */
    readonly liveGames = signal<LiveGame[]>([]);
    /** The game currently being watched in detail (null = none). */
    readonly currentGame = signal<LiveGame | null>(null);
    /** Play-by-play for the watched game, newest first. */
    readonly plays = signal<LivePlay[]>([]);
    /** Live game clock text pushed by the server. */
    readonly clock = signal<string>('');

    /** Set of game keys currently known to the ticker (for cross-linking). */
    readonly liveKeys = computed(() => new Set(this.liveGames().map(g => liveGameKey(g))));
    /** Keys of games that are being played right now (for LIVE badges). */
    readonly liveNowKeys = computed(() =>
        new Set(this.liveGames().filter(g => this.statusOf(g) === 'live').map(g => liveGameKey(g))));

    /**
     * Derive a game's status from the ticker's own fields (NOT `Active`, which
     * is always true, or `Period`, always 0 in the list). Shared by the live
     * view and by cross-linking consumers (Liga).
     */
    statusOf(g: LiveGame): 'live' | 'finished' | 'upcoming' {
        const short = (g.LiveShortText || '').trim();
        const detail = (g.LiveDetailText || '').toLowerCase();
        const isScore = /^\d+\s*:\s*\d+$/.test(short);
        if (detail.includes('spielende') || (g.LiveShortCSS === 'black' && isScore)) return 'finished';
        if (g.LiveShortCSS === 'magenta' && isScore) return 'live';
        return 'upcoming';
    }

    private watchKey: string | null = null;

    /** Look up a ticker game by its shared game key. */
    findByKey(key: string): LiveGame | undefined {
        return this.liveGames().find(g => liveGameKey(g) === key);
    }

    /** Connect (if needed) and watch the game with the given key, if present. */
    async watchByKey(key: string): Promise<boolean> {
        await this.connect();
        const game = this.findByKey(key);
        if (game) {
            await this.watchGame(game);
            return true;
        }
        return false;
    }

    // ---- Public API --------------------------------------------------------

    /** Establish the connection (idempotent) and load the live games list. */
    async connect(): Promise<void> {
        if (this.running || this.state() === 'connecting') return;
        this.state.set('connecting');
        try {
            await this.negotiate();
            await this.transportConnect();
            await this.start();
            this.running = true;
            this.state.set('connected');
            this.pollLoop(); // fire-and-forget
            await this.refreshGames();
        } catch (e) {
            console.error('Liveticker connect failed:', e);
            this.state.set('error');
        }
    }

    /** Reload the list of live games. */
    async refreshGames(): Promise<void> {
        const games = await this.invoke<LiveGame[]>('getAllGames', []);
        if (Array.isArray(games)) this.liveGames.set(games);
    }

    /** Start watching a specific game's live play-by-play. */
    async watchGame(game: LiveGame): Promise<void> {
        await this.connect();
        this.currentGame.set(game);
        this.watchKey = this.keyOf(game);
        this.plays.set([]);
        this.clock.set('');
        const plan = await this.invoke<LivePlay[]>('getGamePlan', [
            game.Season, game.LeagueID, game.Gruppe ?? '', game.LeagueKind, game.GameID,
            game.HomeRegID ?? '', game.HomeTeamID ?? 0, game.GuestRegID ?? '', game.GuestTeamID ?? 0
        ]);
        if (Array.isArray(plan)) {
            // Newest first for display.
            this.plays.set([...plan].sort((a, b) => (b.Number ?? 0) - (a.Number ?? 0)));
        }
    }

    /** Stop watching the current game (keeps the connection for the games list). */
    unwatch(): void {
        this.currentGame.set(null);
        this.watchKey = null;
        this.plays.set([]);
        this.clock.set('');
    }

    /** Tear down the connection entirely. */
    disconnect(): void {
        this.running = false;
        this.pollAbort?.abort();
        this.pollAbort = null;
        this.connectionToken = null;
        this.messageId = null;
        this.state.set('idle');
        this.unwatch();
    }

    // ---- SignalR 2.x longPolling transport ---------------------------------

    private async negotiate(): Promise<void> {
        const res = await fetch(this.url('negotiate'), { headers: { Accept: 'application/json' } });
        const data = await res.json();
        this.connectionToken = data.ConnectionToken;
    }

    private async transportConnect(): Promise<void> {
        const res = await fetch(this.url('connect', { transport: 'longPolling' }), {
            headers: { Accept: 'application/json' }
        });
        this.dispatchEnvelope(await res.json());
    }

    private async start(): Promise<void> {
        await fetch(this.url('start', { transport: 'longPolling' }), { headers: { Accept: 'application/json' } });
    }

    /** Invoke a hub method and return its result (`R`). */
    private async invoke<T>(method: string, args: any[]): Promise<T | null> {
        if (!this.connectionToken) await this.connect();
        const body = new URLSearchParams({
            data: JSON.stringify({ H: 'wbhub', M: method, A: args, I: this.invocationId++ })
        });
        try {
            const res = await fetch(this.url('send', { transport: 'longPolling' }), {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: body.toString()
            });
            const data = await res.json();
            return (data?.R ?? null) as T;
        } catch (e) {
            console.error(`Liveticker invoke ${method} failed:`, e);
            return null;
        }
    }

    private async pollLoop(): Promise<void> {
        while (this.running) {
            this.pollAbort = new AbortController();
            // Abort before the serverless function times out, then re-poll with
            // the same cursor (no message loss — longPolling is cursor based).
            const timer = setTimeout(() => this.pollAbort?.abort(), 28_000);
            try {
                const res = await fetch(this.url('poll', { transport: 'longPolling' }), {
                    signal: this.pollAbort.signal,
                    headers: { Accept: 'application/json' }
                });
                if (res.ok) {
                    const text = await res.text();
                    if (text) this.dispatchEnvelope(JSON.parse(text));
                }
            } catch {
                // AbortError (our timeout) or transient network error — back off briefly.
                if (this.running) await this.delay(1500);
            } finally {
                clearTimeout(timer);
            }
        }
    }

    /** Handle a SignalR message envelope: cursor `C` + messages `M`. */
    private dispatchEnvelope(env: any): void {
        if (!env) return;
        if (env.C) this.messageId = env.C;
        const messages: any[] = env.M ?? [];
        for (const m of messages) {
            this.dispatchMessage(m?.M, m?.A ?? []);
        }
    }

    private dispatchMessage(method: string, args: any[]): void {
        switch (method) {
            case 'gameTime':
                this.clock.set(String(args[0] ?? ''));
                break;
            case 'updateGame':
                this.handleGameUpdate(args[0]);
                break;
            case 'addPlay':
                this.handlePlay(args[0], true);
                break;
            case 'updatePlay':
                this.handlePlay(args[0], false);
                break;
        }
    }

    private handleGameUpdate(game: LiveGame): void {
        if (!game) return;
        const key = this.keyOf(game);
        // Update in the list.
        this.liveGames.update(list => {
            const idx = list.findIndex(g => this.keyOf(g) === key);
            if (idx === -1) return [...list, game];
            const copy = [...list];
            copy[idx] = { ...copy[idx], ...game };
            return copy;
        });
        // Update the watched game.
        if (this.watchKey === key) {
            this.currentGame.update(g => (g ? { ...g, ...game } : game));
        }
    }

    private handlePlay(play: LivePlay, isNew: boolean): void {
        if (!play || this.keyOf(play) !== this.watchKey) return;
        this.plays.update(list => {
            const idx = list.findIndex(p => p.Number === play.Number);
            if (idx === -1) {
                return [play, ...list].sort((a, b) => (b.Number ?? 0) - (a.Number ?? 0));
            }
            const copy = [...list];
            copy[idx] = { ...copy[idx], ...play };
            return copy;
        });
    }

    // ---- helpers -----------------------------------------------------------

    private keyOf(g: { Season: any; LeagueID: any; Gruppe?: any; LeagueKind: any; GameID: any }): string {
        return liveGameKey(g);
    }

    private url(action: string, extra: Record<string, string> = {}): string {
        const params = new URLSearchParams({
            clientProtocol: '2.1',
            connectionData: this.connectionData,
            ...extra
        });
        if (this.connectionToken) params.set('connectionToken', this.connectionToken);
        if (action === 'poll' && this.messageId) params.set('messageId', this.messageId);
        return `${this.base}/${action}?${params.toString()}`;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
