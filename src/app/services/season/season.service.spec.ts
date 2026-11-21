import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SeasonService, seasonForDate } from './season.service';

describe('SeasonService', () => {
    let service: SeasonService;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(SeasonService);
    });

    it('derives the running season from the date (season starts in August)', () => {
        expect(seasonForDate(new Date(2026, 10, 16))).toBe('2026');
        expect(seasonForDate(new Date(2026, 6, 31))).toBe('2025');
        expect(seasonForDate(new Date(2027, 2, 1))).toBe('2026');
    });

    it('formats season labels', () => {
        expect(service.getSeasonLabel('2026')).toBe('2026/27');
        expect(service.getSeasonLabel('1999')).toBe('1999/00');
    });

    it('follows the season DSV actually serves and keeps the user on live', () => {
        const before = service.liveSeason();
        const next = String(+before + 1);
        service.confirmLiveSeason(next);
        expect(service.liveSeason()).toBe(next);
        expect(service.currentSeason()).toBe(next);
        expect(service.isCurrentSeason).toBe(true);
        expect(service.availableSeasons()[0]).toBe(next);
    });

    it('does not pull an archive visitor back to the live season', () => {
        service.setSeason('2015');
        service.confirmLiveSeason(String(+service.liveSeason() + 1));
        expect(service.currentSeason()).toBe('2015');
        expect(service.isLive()).toBe(false);
    });

    it('ignores implausible seasons', () => {
        const before = service.liveSeason();
        service.confirmLiveSeason('abc');
        expect(service.liveSeason()).toBe(before);
    });
});
