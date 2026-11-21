import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { OverviewComponent, genderOf } from './overview.component';
import { OverviewService } from '../../services/overview/overview.service';
import { FavoritesService } from '../../services/favorites/favorites.service';
import { Item } from '../../models/item';

const ITEMS: Item[] = [
    { name: 'National Offen', subItems: [
            { name: 'Bundesliga Männer', gender: 'männlich', link: 'League.aspx?Season=2026&LeagueID=1', isFavorite: false, status: 'in 5 Tagen' },
            { name: 'Bundesliga Frauen', gender: 'weiblich', link: 'League.aspx?Season=2026&LeagueID=2', isFavorite: false }
        ] },
    { name: 'Bayern', subItems: [
            { name: 'Oberliga Bayern', gender: 'männlich', link: 'League.aspx?Season=2026&LeagueID=3', isFavorite: false }
        ] }
];

describe('OverviewComponent', () => {
    let fixture: ComponentFixture<OverviewComponent>;
    let component: OverviewComponent;
    let overview: MockedObject<OverviewService>;

    function setup(items$ = of(ITEMS)) {
        localStorage.removeItem('favorites');
        overview = {
            getItems: vi.fn().mockName("OverviewService.getItems")
        } as unknown as MockedObject<OverviewService>;
        overview.getItems.mockReturnValue(items$);
        TestBed.configureTestingModule({
            imports: [OverviewComponent],
            providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: OverviewService, useValue: overview }]
        });
        fixture = TestBed.createComponent(OverviewComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    it('lists the categories with the first one expanded', () => {
        setup();
        expect(component.isLoading()).toBe(false);
        expect(component.totalCount()).toBe(3);
        expect(component.isOpen(ITEMS[0])).toBe(true);
        expect(component.isOpen(ITEMS[1])).toBe(false);
        expect(fixture.nativeElement.textContent).toContain('Bundesliga Männer');
        expect(fixture.nativeElement.textContent).not.toContain('Oberliga Bayern');
    });

    it('searches league and category names and opens all matches', () => {
        setup();
        component.onSearch('bayern');
        expect(component.filteredItems().map(i => i.name)).toEqual(['Bayern']);
        expect(component.isOpen(ITEMS[1])).toBe(true);
        component.onSearch('gibt es nicht');
        expect(component.resultCount()).toBe(0);
    });

    it('filters by gender', () => {
        setup();
        component.setGender('w');
        expect(component.filteredItems().flatMap(i => i.subItems).map(s => s.name)).toEqual(['Bundesliga Frauen']);
    });

    it('normalises gender labels', () => {
        expect(genderOf('männlich')).toBe('m');
        expect(genderOf('Frauen')).toBe('w');
        expect(genderOf('mixed')).toBe('x');
        expect(genderOf('')).toBe('');
    });

    it('toggles favourites and lists them on top', () => {
        setup();
        component.toggleFavorite(ITEMS[0].subItems[1], false);
        expect(TestBed.inject(FavoritesService).isFavorite('Bundesliga Frauen')).toBe(true);
        expect(component.favorites().map(f => f.name)).toEqual(['Bundesliga Frauen']);
        component.toggleFavorite(ITEMS[0].subItems[1], false);
        expect(component.favorites()).toEqual([]);
    });

    it('offers a retry when the index cannot be loaded', () => {
        setup(throwError(() => new Error('offline')));
        expect(component.failed()).toBe(true);
        overview.getItems.mockReturnValue(of(ITEMS));
        component.retry();
        fixture.detectChanges();
        expect(component.failed()).toBe(false);
        expect(overview.getItems).toHaveBeenCalledWith(true);
    });
});
