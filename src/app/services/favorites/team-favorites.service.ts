import { Injectable, signal } from '@angular/core';
import { LeagueRef } from './favorites.service';

const STORAGE_KEY = 'favorite-teams';
const CONTEXT_KEY = 'favorite-team-leagues';

/**
 * Tracks the user's favourite teams (by name) in localStorage. Independent from
 * league favourites (FavoritesService) — a team can be followed across leagues
 * and seasons.
 *
 * Alongside the names we remember in which league(s) a team was starred, so
 * the home feed knows where to look for that team's games.
 */
@Injectable({ providedIn: 'root' })
export class TeamFavoritesService {
    private readonly _teams = signal<string[]>(this.read());
    private readonly _leagues = signal<Record<string, LeagueRef[]>>(this.readContext());
    /** Reactive list of favourite team names. */
    readonly teams = this._teams.asReadonly();
    /** team name -> leagues the team was followed in. */
    readonly teamLeagues = this._leagues.asReadonly();

    private read(): string[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter(t => typeof t === 'string') : [];
        } catch {
            return [];
        }
    }

    private readContext(): Record<string, LeagueRef[]> {
        try {
            const parsed = JSON.parse(localStorage.getItem(CONTEXT_KEY) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }

    private persist(teams: string[]): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
            localStorage.setItem(CONTEXT_KEY, JSON.stringify(this._leagues()));
        } catch {
            /* storage unavailable – keep in-memory only */
        }
    }

    isFavorite(team: string): boolean {
        return this._teams().includes(team);
    }

    /** Toggle a team; `league` records where the team plays (optional). */
    toggle(team: string, league?: LeagueRef): void {
        if (!team) return;
        const current = this._teams();
        const removing = current.includes(team);
        const next = removing ? current.filter(t => t !== team) : [...current, team];

        const ctx = { ...this._leagues() };
        if (removing) {
            delete ctx[team];
        } else if (league?.link) {
            ctx[team] = [league, ...(ctx[team] ?? []).filter(l => l.name !== league.name)].slice(0, 4);
        }
        this._leagues.set(ctx);
        this._teams.set(next);
        this.persist(next);
    }

    /** Remember an additional league for an already-followed team. */
    noteLeague(team: string, league: LeagueRef): void {
        if (!this.isFavorite(team) || !league.link) return;
        const known = this._leagues()[team] ?? [];
        if (known.some(l => l.name === league.name && l.link === league.link)) return;
        const ctx = { ...this._leagues(), [team]: [league, ...known.filter(l => l.name !== league.name)].slice(0, 4) };
        this._leagues.set(ctx);
        this.persist(this._teams());
    }
}
