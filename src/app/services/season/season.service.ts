import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/** The season that is served live from DSV website */
export const LIVE_SEASON = '2025';

@Injectable({
    providedIn: 'root'
})
export class SeasonService {
    private http = inject(HttpClient);

    // Current active season (year string)
    readonly currentSeason = signal<string>(LIVE_SEASON);

    // Available seasons – loaded dynamically from DB, with LIVE_SEASON always first
    readonly availableSeasons = signal<string[]>([LIVE_SEASON]);

    // Whether the seasons have been loaded from DB
    readonly seasonsLoaded = signal<boolean>(false);

    // Helper to check if we need live data or historical
    get isCurrentSeason(): boolean {
        return this.currentSeason() === LIVE_SEASON;
    }

    /** Returns display label for a season, e.g. "2025/2026" */
    getSeasonLabel(season?: string): string {
        const s = season ?? this.currentSeason();
        const year = parseInt(s, 10);
        return `${year}/${year + 1}`;
    }

    /** Is the given (or current) season the live one? */
    isLive(season?: string): boolean {
        return (season ?? this.currentSeason()) === LIVE_SEASON;
    }

    setSeason(season: string) {
        this.currentSeason.set(season);
    }

    /**
     * Load available seasons from the lightweight season index (seasons.json).
     *
     * This deliberately does NOT touch the SQLite database: the multi-MB DB is
     * only downloaded once a user actually opens an archive season. Live-season
     * visitors never pay for it.
     */
    async loadAvailableSeasons(): Promise<void> {
        try {
            const res = await firstValueFrom(
                this.http.get<{ seasons: string[] }>('assets/data/seasons.json')
            );
            const dbSeasons = res?.seasons ?? [];

            // Ensure LIVE_SEASON is always first, then historical seasons
            const allSeasons = [LIVE_SEASON, ...dbSeasons.filter(s => s !== LIVE_SEASON)];
            this.availableSeasons.set(allSeasons);
            this.seasonsLoaded.set(true);
        } catch (e) {
            console.error('Failed to load season index:', e);
            // Keep the default [LIVE_SEASON] as fallback
        }
    }
}
