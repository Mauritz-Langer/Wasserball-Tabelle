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
/** How often the list of games is re-read while connected. */
const LIST_REFRESH_MS = 60_000;

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

    /** Ticker games by shared game key. */
    readonly byKey = computed(() => new Map(this.liveGames().map(g => [liveGameKey(g), g])));

    /** Current score of a ticker game as "h:g". */
    scoreOf(game: LiveGame): string {
        if (game.ScoreText && game.ScoreText.includes(':')) return game.ScoreText.replace(/\s+/g, '');
        const valid = (n: any) => typeof n === 'number' && n >= 0 && n < 200;
        const h = valid(game.HomeGoalsFinal) ? game.HomeGoalsFinal : (valid(game.HomeGoals) ? game.HomeGoals : 0);
        const g = valid(game.GuestGoalsFinal) ? game.GuestGoalsFinal : (valid(game.GuestGoals) ? game.GuestGoals : 0);
        return `${h}:${g}`;
    }

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

    // ---- Shared connection lifetime ---------------------------------------
    //
    // Several views show live data (home, league hub, game centre, live list).
    // Each one retains the connection while it is on screen; the connection is
    // closed shortly after the last one lets go, and paused while the tab is
    // hidden — every poll is a proxied request, so we never poll for nobody.

    private holders = 0;
    private releaseTimer: ReturnType<typeof setTimeout> | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private paused = false;

    constructor() {
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => this.onVisibility());
        }
    }

    /** Keep the ticker connected while the caller is on screen. */
    retain(): void {
        this.holders++;
        if (this.releaseTimer) { clearTimeout(this.releaseTimer); this.releaseTimer = null; }
        if (!this.paused) this.connect();
    }

    /** Counterpart to `retain()`; disconnects once nobody is left. */
    release(): void {
        this.holders = Math.max(0, this.holders - 1);
        if (this.holders > 0 || this.releaseTimer) return;
        this.releaseTimer = setTimeout(() => {
            this.releaseTimer = null;
            if (this.holders === 0) this.disconnect();
        }, 5000);
    }

    private onVisibility(): void {
        if (document.hidden) {
            if (this.running) { this.paused = true; this.teardown(); }
        } else if (this.paused) {
            this.paused = false;
            if (this.holders > 0) this.resume();
        }
    }

    /** Reconnect and pick the watched game up again. */
    private async resume(): Promise<void> {
        const key = this.watchKey;
        await this.connect();
        if (key && this.running) {
            const game = this.findByKey(key);
            if (game) await this.loadPlan(game);
        }
    }

    private scheduleRetry(): void {
        if (this.retryTimer || this.holders === 0) return;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            if (this.holders > 0 && !this.running && !this.paused) this.resume();
        }, 15_000);
    }

    /** Look up a ticker game by its shared game key. */
    findByKey(key: string): LiveGame | undefined {
        return this.byKey().get(key);
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
        if (this.running) return;
        if (this.connecting) return this.connecting;
        this.connecting = this.open().finally(() => { this.connecting = null; });
        return this.connecting;
    }

    private connecting: Promise<void> | null = null;

    private async open(): Promise<void> {
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
            this.running = false;
            this.connectionToken = null;
            this.state.set('error');
            this.scheduleRetry();
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
        await this.loadPlan(game);
    }

    private async loadPlan(game: LiveGame): Promise<void> {
        const key = this.keyOf(game);
        const plan = await this.invoke<LivePlay[]>('getGamePlan', [
            game.Season, game.LeagueID, game.Gruppe ?? '', game.LeagueKind, game.GameID,
            game.HomeRegID ?? '', game.HomeTeamID ?? 0, game.GuestRegID ?? '', game.GuestTeamID ?? 0
        ]);
        if (Array.isArray(plan) && this.watchKey === key) {
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
        this.teardown();
        // Without a connection the list would go stale (a "live" badge for a
        // game that has ended long ago): forget it.
        this.liveGames.set([]);
        this.paused = false;
        if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
        this.unwatch();
    }

    /** Stop polling but keep the watched game and the last known data. */
    private teardown(): void {
        this.running = false;
        this.pollAbort?.abort();
        this.pollAbort = null;
        this.connectionToken = null;
        this.messageId = null;
        this.state.set('idle');
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
        if (!this.connectionToken) return null;
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
        const token = this.connectionToken;
        let failures = 0;
        let listAt = Date.now();
        // The loop belongs to one connection: it ends when that connection is
        // torn down or replaced.
        while (this.running && this.connectionToken === token) {
            // The hub pushes changes of known games only: games added or
            // removed later (rescheduled, test entries) need a fresh list.
            if (Date.now() - listAt > LIST_REFRESH_MS) {
                listAt = Date.now();
                this.refreshGames().catch(() => { /* next round */ });
            }
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
                    failures = 0;
                    const text = await res.text();
                    if (text) this.dispatchEnvelope(JSON.parse(text));
                } else if (++failures >= 3) {
                    // Token expired / server restarted: start over.
                    this.reconnect(token);
                    return;
                } else {
                    await this.delay(2000);
                }
            } catch (e: any) {
                // AbortError is our own timeout; anything else is a network error.
                if (this.running && this.connectionToken === token) {
                    if (e?.name !== 'AbortError' && ++failures >= 5) { this.reconnect(token); return; }
                    await this.delay(1500);
                }
            } finally {
                clearTimeout(timer);
            }
        }
    }

    private reconnect(token: string | null): void {
        if (this.connectionToken !== token) return;
        this.teardown();
        if (this.holders > 0 && !this.paused) this.resume().then(() => { if (!this.running) this.scheduleRetry(); });
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
