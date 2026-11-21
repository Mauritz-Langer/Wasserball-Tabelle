import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { HomeComponent } from './home.component';
import { LigaService } from '../../services/liga/liga.service';
import { OverviewService } from '../../services/overview/overview.service';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { SeasonService } from '../../services/season/season.service';
import { TickerStub } from '../../testing/ticker.stub';
import { LIGA_PARAM, makeLeague } from '../../testing/fixtures';

const KEYS = ['favorites', 'recent-leagues', 'favorite-teams', 'favorite-team-leagues'];

describe('HomeComponent', () => {
    let fixture: ComponentFixture<HomeComponent>;
    let component: HomeComponent;
    let ligaService: MockedObject<LigaService>;

    function setup(storage: Record<string, unknown> = {}) {
        KEYS.forEach(k => localStorage.removeItem(k));
        Object.entries(storage).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
        ligaService = {
            fetchLeagueData: vi.fn().mockName("LigaService.fetchLeagueData"),
            peek: vi.fn().mockName("LigaService.peek")
        } as unknown as MockedObject<LigaService>;
        ligaService.peek.mockReturnValue(null);
        ligaService.fetchLeagueData.mockReturnValue(of(makeLeague()));
        const overview = {
            getItems: vi.fn().mockName("OverviewService.getItems")
        };
        overview.getItems.mockReturnValue(of([{
                name: 'National', subItems: [{ name: 'Testliga', gender: '', link: LIGA_PARAM, isFavorite: false }]
            }]));
        TestBed.configureTestingModule({
            imports: [HomeComponent],
            providers: [
                provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
                { provide: LigaService, useValue: ligaService },
                { provide: OverviewService, useValue: overview },
                { provide: LiveTickerService, useValue: new TickerStub() }
            ]
        });
        fixture = TestBed.createComponent(HomeComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    afterEach(() => KEYS.forEach(k => localStorage.removeItem(k)));

    it('welcomes first-time visitors with suggestions and loads no leagues', () => {
        setup();
        expect(component.hasFollows()).toBe(false);
        expect(ligaService.fetchLeagueData).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain('Dein Wasserball, auf einen Blick');
        expect(component.suggestions().map(s => s.name)).toEqual(['Testliga']);
    });

    it('builds the feed from followed leagues', () => {
        setup({ favorites: [{ name: 'Testliga', gender: '', link: LIGA_PARAM }] });
        expect(ligaService.fetchLeagueData).toHaveBeenCalledWith(LIGA_PARAM);
        expect(component.teamMode()).toBe(false);
        expect(component.spotlight()!.game.home).toBe('Gamma');
        expect(component.results().map(f => f.game.result)).toEqual(['5:5', '10:7']);
        expect(component.myLeagues()[0].leader).toBe('Alpha führt mit 3 Punkten');
    });

    it('narrows the feed to followed teams', () => {
        setup({
            favorites: [{ name: 'Testliga', gender: '', link: LIGA_PARAM }],
            'favorite-teams': ['Beta']
        });
        expect(component.teamMode()).toBe(true);
        expect(component.spotlight()).toBeNull(); // Beta has no fixture left
        expect(component.results().length).toBe(2);
        expect(fixture.nativeElement.textContent).toContain('Letzte Ergebnisse');
    });

    it('finds a followed team through the league it was starred in', () => {
        setup({
            'favorite-teams': ['Alpha'],
            'favorite-team-leagues': { Alpha: [{ name: 'Testliga', gender: '', link: LIGA_PARAM }] }
        });
        expect(ligaService.fetchLeagueData).toHaveBeenCalledWith(LIGA_PARAM);
        expect(component.spotlight()!.game.guest).toBe('Alpha');
    });

    it('points archive visitors to the leagues instead of a feed', () => {
        setup({ favorites: [{ name: 'Testliga', gender: '', link: LIGA_PARAM }] });
        TestBed.inject(SeasonService).setSeason('2015');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Du blätterst im Archiv');
    });
});
