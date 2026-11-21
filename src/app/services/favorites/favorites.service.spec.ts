import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';

describe('FavoritesService', () => {
    const league = { name: 'Bundesliga Männer', gender: 'männlich', link: 'League.aspx?Season=2026&LeagueID=1' };
    let service: FavoritesService;

    beforeEach(() => {
        localStorage.removeItem('favorites');
        localStorage.removeItem('recent-leagues');
        TestBed.configureTestingModule({});
        service = TestBed.inject(FavoritesService);
    });

    afterEach(() => {
        localStorage.removeItem('favorites');
        localStorage.removeItem('recent-leagues');
    });

    it('starts empty', () => {
        expect(service.count()).toBe(0);
        expect(service.leagues()).toEqual([]);
    });

    it('toggles a league and persists it', () => {
        expect(service.toggle(league)).toBe(true);
        expect(service.isFavorite(league.name)).toBe(true);
        expect(JSON.parse(localStorage.getItem('favorites')!)).toEqual([league]);

        expect(service.toggle(league)).toBe(false);
        expect(service.count()).toBe(0);
        expect(JSON.parse(localStorage.getItem('favorites')!)).toEqual([]);
    });

    it('reads favourites saved by earlier versions (with isFavorite flag)', () => {
        localStorage.setItem('favorites', JSON.stringify([{ ...league, isFavorite: true }]));
        service = new FavoritesService(); // re-reads storage
        expect(service.leagues()).toEqual([league]);
    });

    it('survives corrupt storage', () => {
        localStorage.setItem('favorites', '{nope');
        service = new FavoritesService(); // re-reads storage
        expect(service.count()).toBe(0);
    });

    it('keeps the most recent leagues first, without duplicates', () => {
        service.addRecent(league);
        service.addRecent({ name: 'Pokal', gender: '', link: 'x' });
        service.addRecent(league);
        expect(service.recent().map(l => l.name)).toEqual(['Bundesliga Männer', 'Pokal']);
    });

    it('moves a favourite to the new season\'s link', () => {
        service.toggle({ ...league, link: 'League.aspx?Season=2025&LeagueID=1' });
        service.reconcile([league]);
        expect(service.leagues()[0].link).toBe(league.link);
    });
});
