import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { TeamsComponent } from './teams.component';
import { LigaService } from '../../services/liga/liga.service';
import { OverviewService } from '../../services/overview/overview.service';
import { TeamFavoritesService } from '../../services/favorites/team-favorites.service';
import { LIGA_PARAM, makeLeague } from '../../testing/fixtures';

const KEYS = ['favorites', 'recent-leagues', 'favorite-teams', 'favorite-team-leagues'];
const LIGA = { name: 'Testliga', gender: '', link: LIGA_PARAM };

describe('TeamsComponent', () => {
    let fixture: ComponentFixture<TeamsComponent>;
    let component: TeamsComponent;
    let ligaService: MockedObject<LigaService>;

    function setup(storage: Record<string, unknown> = {}, query: Record<string, string> = {}) {
        KEYS.forEach(k => localStorage.removeItem(k));
        Object.entries(storage).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
        ligaService = {
            fetchLeagueData: vi.fn().mockName("LigaService.fetchLeagueData"),
            peek: vi.fn().mockName("LigaService.peek")
        } as unknown as MockedObject<LigaService>;
        ligaService.fetchLeagueData.mockReturnValue(of(makeLeague()));
        ligaService.peek.mockReturnValue(null);
        const overview = {
            getItems: vi.fn().mockName("OverviewService.getItems")
        };
        overview.getItems.mockReturnValue(of([{ name: 'National', subItems: [{ ...LIGA, isFavorite: false }, { name: 'Oberliga Nord', gender: '', link: 'x', isFavorite: false }] }]));
        TestBed.configureTestingModule({
            imports: [TeamsComponent],
            providers: [
                provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
                { provide: LigaService, useValue: ligaService },
                { provide: OverviewService, useValue: overview },
                { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }
            ]
        });
        fixture = TestBed.createComponent(TeamsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    afterEach(() => KEYS.forEach(k => localStorage.removeItem(k)));

    it('invites to follow a team when none is followed', () => {
        setup();
        expect(component.followed()).toEqual([]);
        expect(fixture.nativeElement.textContent).toContain('Noch keinem Team gefolgt');
    });

    it('lists followed teams with their next game and last result', () => {
        setup({ 'favorite-teams': ['Alpha'], 'favorite-team-leagues': { Alpha: [LIGA] } });
        const [alpha] = component.followed();
        expect(alpha.name).toBe('Alpha');
        expect(alpha.next).toContain('bei Gamma'); // fixture: Gamma – Alpha in 2099
        expect(alpha.last).toBe('gegen Beta 10:7');
        expect(alpha.lastOutcome).toBe('W');
    });

    it('suggests the other teams of my leagues and follows one with its league', () => {
        setup({ favorites: [LIGA] });
        const [suggestion] = component.suggestions();
        expect(suggestion.teams.map(t => t.name)).toEqual(['Alpha', 'Gamma', 'Beta']); // table order
        component.toggle('Gamma', suggestion.league);
        const favs = TestBed.inject(TeamFavoritesService);
        expect(favs.isFavorite('Gamma')).toBe(true);
        expect(favs.teamLeagues()['Gamma'][0].link).toBe(LIGA_PARAM);
        expect(component.suggestions()[0].teams.map(t => t.name)).not.toContain('Gamma');
    });

    it('finds a league and lists its teams to follow', () => {
        setup();
        component.query.set('ober');
        expect(component.leagueMatches().map(l => l.name)).toEqual(['Oberliga Nord']);
        component.pick({ name: 'Testliga', gender: '', link: LIGA_PARAM });
        expect(component.pickedTeams().length).toBe(3);
    });

    it('opens the league given in the URL', () => {
        setup({}, { liga: LIGA_PARAM });
        expect(component.picked()?.name).toBe('Testliga');
        expect(component.pickedTeams().map(t => t.name)).toContain('Beta');
    });
});
