import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/**
 * The season DSV serves live, derived from the calendar: a water-polo season
 * starts in late summer, so from August on the current year is the season year
 * (2026 -> "2026/2027"), before that it is the previous year.
 */
export function seasonForDate(date: Date): string {
    return String(date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1);
}

/** Best guess for the live season at startup (refined by the DSV index). */
export const LIVE_SEASON = seasonForDate(new Date());

@Injectable({
    providedIn: 'root'
})
export class SeasonService {
    private http = inject(HttpClient);

    /** The season served live by DSV. */
    readonly liveSeason = signal<string>(LIVE_SEASON);

    // Current active season (year string)
    readonly currentSeason = signal<string>(LIVE_SEASON);

    // Available seasons – live season first, then the archive seasons
    readonly availableSeasons = signal<string[]>([LIVE_SEASON]);

    readonly seasonsLoaded = signal<boolean>(false);

    private archiveSeasons: string[] = [];

    // Helper to check if we need live data or historical
    get isCurrentSeason(): boolean {
        return this.currentSeason() === this.liveSeason();
    }

    /** Returns display label for a season, e.g. "2025/26" */
    getSeasonLabel(season?: string): string {
        const year = parseInt(season ?? this.currentSeason(), 10);
        return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
    }

    /** Is the given (or current) season the live one? */
    isLive(season?: string): boolean {
        return (season ?? this.currentSeason()) === this.liveSeason();
    }

    setSeason(season: string) {
        this.currentSeason.set(season);
    }

    /**
     * Correct the live season from what DSV actually serves (the season in the
     * league links of the index page). Keeps the user on "live" if they were.
     */
    confirmLiveSeason(season: string): void {
        if (!/^\d{4}$/.test(season) || season === this.liveSeason()) return;
        const wasLive = this.isCurrentSeason;
        this.liveSeason.set(season);
        if (wasLive) this.currentSeason.set(season);
        this.rebuildSeasons();
    }

    private rebuildSeasons(): void {
        const live = this.liveSeason();
        this.availableSeasons.set([live, ...this.archiveSeasons.filter(s => s !== live)]);
    }

    /**
     * Load available seasons from the archive manifest (archive.json).
     *
     * This deliberately does NOT touch the archive databases: a season's file is
     * only downloaded once a user actually opens that season. Live-season
     * visitors never pay for it.
     */
    async loadAvailableSeasons(): Promise<void> {
        try {
            const res = await firstValueFrom(
                this.http.get<{ seasons: string[] }>('assets/data/archive/archive.json')
            );
            this.archiveSeasons = res?.seasons ?? [];
            this.rebuildSeasons();
            this.seasonsLoaded.set(true);
        } catch (e) {
            console.error('Failed to load season index:', e);
            // Keep the default [live season] as fallback
        }
    }
}
