import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class SeasonService {
    // Current active season (year string)
    readonly currentSeason = signal<string>('2025');

    // Helper to check if we need live data or historical
    get isCurrentSeason(): boolean {
        return this.currentSeason() === '2025';
    }

    readonly availableSeasons = ['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2014', '2013', '2012', '2011'];

    setSeason(season: string) {
        this.currentSeason.set(season);
    }
}
