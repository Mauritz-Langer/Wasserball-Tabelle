import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'favorite-teams';

/**
 * Tracks the user's favourite teams (by name) in localStorage. Independent from
 * league favourites (FavoritesService) — a team can be followed across leagues
 * and seasons.
 */
@Injectable({ providedIn: 'root' })
export class TeamFavoritesService {
    private readonly _teams = signal<string[]>(this.read());
    /** Reactive list of favourite team names. */
    readonly teams = this._teams.asReadonly();

    private read(): string[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter(t => typeof t === 'string') : [];
        } catch {
            return [];
        }
    }

    private persist(teams: string[]): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
        } catch {
            /* storage unavailable – keep in-memory only */
        }
    }

    isFavorite(team: string): boolean {
        return this._teams().includes(team);
    }

    toggle(team: string): void {
        if (!team) return;
        const current = this._teams();
        const next = current.includes(team)
            ? current.filter(t => t !== team)
            : [...current, team];
        this._teams.set(next);
        this.persist(next);
    }
}
