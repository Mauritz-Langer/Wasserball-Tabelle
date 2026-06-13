import { TestBed } from '@angular/core/testing';
import { TeamFavoritesService } from './team-favorites.service';

describe('TeamFavoritesService', () => {
    beforeEach(() => {
        localStorage.removeItem('favorite-teams');
        TestBed.configureTestingModule({});
    });

    it('starts empty', () => {
        const service = TestBed.inject(TeamFavoritesService);
        expect(service.teams()).toEqual([]);
        expect(service.isFavorite('Wfr. Spandau 04')).toBeFalse();
    });

    it('toggles a team on and off and persists', () => {
        const service = TestBed.inject(TeamFavoritesService);
        service.toggle('Wfr. Spandau 04');
        expect(service.isFavorite('Wfr. Spandau 04')).toBeTrue();
        expect(JSON.parse(localStorage.getItem('favorite-teams')!)).toContain('Wfr. Spandau 04');

        service.toggle('Wfr. Spandau 04');
        expect(service.isFavorite('Wfr. Spandau 04')).toBeFalse();
    });

    it('ignores empty team names', () => {
        const service = TestBed.inject(TeamFavoritesService);
        service.toggle('');
        expect(service.teams()).toEqual([]);
    });
});
