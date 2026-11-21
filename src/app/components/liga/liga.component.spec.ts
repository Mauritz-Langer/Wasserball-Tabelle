import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { LigaComponent } from './liga.component';
import { LigaService } from '../../services/liga/liga.service';
import { OverviewService } from '../../services/overview/overview.service';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { TeamFavoritesService } from '../../services/favorites/team-favorites.service';
import { FavoritesService } from '../../services/favorites/favorites.service';
import { TickerStub } from '../../testing/ticker.stub';
import { LIGA_PARAM, makeLeague } from '../../testing/fixtures';

describe('LigaComponent', () => {
    let fixture: ComponentFixture<LigaComponent>;
    let component: LigaComponent;
    let ligaService: MockedObject<LigaService>;
    let ticker: TickerStub;
    let queryParams: BehaviorSubject<Record<string, string>>;

    function setup(params: Record<string, string> = { param: LIGA_PARAM }, data$ = of(makeLeague())) {
        ['favorites', 'recent-leagues', 'favorite-teams', 'favorite-team-leagues'].forEach(k => localStorage.removeItem(k));
        ligaService = {
            fetchLeagueData: vi.fn().mockName("LigaService.fetchLeagueData"),
            peek: vi.fn().mockName("LigaService.peek")
        } as unknown as MockedObject<LigaService>;
        ligaService.peek.mockReturnValue(null);
        ligaService.fetchLeagueData.mockReturnValue(data$);
        const overview = {
            getItems: vi.fn().mockName("OverviewService.getItems")
        };
        overview.getItems.mockReturnValue(of([{
                name: 'National', subItems: [{ name: 'Testliga', gender: 'männlich', link: LIGA_PARAM, isFavorite: false }]
            }]));
        ticker = new TickerStub();
        queryParams = new BehaviorSubject(params);

        TestBed.configureTestingModule({
            imports: [LigaComponent],
            providers: [
                provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
                { provide: LigaService, useValue: ligaService },
                { provide: OverviewService, useValue: overview },
                { provide: LiveTickerService, useValue: ticker },
                { provide: ActivatedRoute, useValue: { queryParams } }
            ]
        });
        fixture = TestBed.createComponent(LigaComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    it('loads the league and uses the clean name from the index', () => {
        setup();
        expect(ligaService.fetchLeagueData).toHaveBeenCalledWith(LIGA_PARAM, false);
        expect(component.isLoading()).toBe(false);
        expect(component.leagueName()).toBe('Testliga');
        expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Testliga');
        expect(TestBed.inject(FavoritesService).recent()[0].name).toBe('Testliga');
    });

    it('groups games by day in playing order and marks the next matchday', () => {
        setup();
        const groups = component.groups();
        expect(groups.map(g => g.key)).toEqual(['2020-10-01', '2020-10-08', '2099-10-01']);
        expect(groups[0].round).toBe('1. Spieltag');
        expect(groups[0].past).toBe(true);
        expect(component.nextGroupKey()).toBe('2099-10-01');
    });

    it('filters by view and team, results newest first', () => {
        setup();
        component.setView('ergebnisse');
        expect(component.groups().map(g => g.key)).toEqual(['2020-10-08', '2020-10-01']);
        component.setView('kommend');
        expect(component.visibleGames().length).toBe(1);
        component.setView('alle');
        component.setTeamFilter('Gamma');
        expect(component.visibleGames().map(g => g.home)).toEqual(['Beta', 'Gamma']);
    });

    it('restores tab and filters from the URL', () => {
        setup({ param: LIGA_PARAM, tab: 'tabelle', ansicht: 'kommend', team: 'Alpha' });
        expect(component.activeTab()).toBe('tabelle');
        expect(component.view()).toBe('kommend');
        expect(component.teamFilter()).toBe('Alpha');
    });

    it('does not refetch when only the tab changes', () => {
        setup();
        queryParams.next({ param: LIGA_PARAM, tab: 'torschuetzen' });
        expect(ligaService.fetchLeagueData).toHaveBeenCalledTimes(1);
        expect(component.activeTab()).toBe('torschuetzen');
    });

    it('adds form to the standings and sorts by column', () => {
        setup();
        expect(component.tableRows().map(r => r.team)).toEqual(['Alpha', 'Gamma', 'Beta']);
        expect(component.tableRows()[2].form).toEqual(['D', 'L']);
        component.sortBy('goalDifference');
        expect(component.tableRows()[0].team).toBe('Alpha');
        component.sortBy('goalDifference');
        expect(component.tableRows()[0].team).toBe('Beta');
        expect(component.ariaSort('goalDifference')).toBe('ascending');
    });

    it('flags followed teams in the standings', () => {
        setup();
        TestBed.inject(TeamFavoritesService).toggle('Gamma');
        expect(component.tableRows().find(r => r.team === 'Gamma')!.favorite).toBe(true);
        expect(component.hasFavoriteTeams()).toBe(true);
    });

    it('splits scorer names and filters them', () => {
        setup();
        const first = component.scorerRows()[0];
        expect(first.player).toBe('Muster, Max');
        expect(first.year).toBe('2001');
        expect(first.average).toBe('6,0');
        component.onScorerSearch('beta');
        expect(component.scorerRows().map(s => s.player)).toEqual(['Beispiel, Ben']);
    });

    it('counts games that are live in the ticker', () => {
        setup();
        expect(component.liveCount()).toBe(0);
        ticker.liveGames.set([{ Season: 2026, LeagueID: 9, Gruppe: '', LeagueKind: 'V', GameID: 3, LiveShortText: '4:2', ScoreText: '4:2' }]);
        expect(component.liveCount()).toBe(1);
        expect(ticker.retain).toHaveBeenCalled();
    });

    it('toggles the league as favourite under its index name', () => {
        setup();
        component.toggleFavorite();
        expect(TestBed.inject(FavoritesService).isFavorite('Testliga')).toBe(true);
        expect(component.isFavorite()).toBe(true);
    });

    it('shows an error state with retry when loading fails', () => {
        setup({ param: LIGA_PARAM }, throwError(() => new Error('offline')));
        expect(component.failed()).toBe(true);
        expect(fixture.nativeElement.textContent).toContain('Liga nicht erreichbar');
    });

    it('refreshes by itself when a live game ends', () => {
        vi.useFakeTimers();
        // jsdom has no layout, so no scrollIntoView.
        Element.prototype.scrollIntoView ??= vi.fn();
        setup();
        ticker.liveGames.set([{ Season: 2026, LeagueID: 9, Gruppe: '', LeagueKind: 'V', GameID: 3, LiveShortText: '4:2', ScoreText: '4:2' }]);
        fixture.detectChanges();
        ticker.liveGames.set([{ Season: 2026, LeagueID: 9, Gruppe: '', LeagueKind: 'V', GameID: 3, LiveShortCSS: 'black', LiveShortText: '9:8', ScoreText: '9:8' }]);
        fixture.detectChanges();
        vi.advanceTimersByTime(4000);
        expect(ligaService.fetchLeagueData).toHaveBeenCalledWith(LIGA_PARAM, true);
        vi.useRealTimers();
    });

    it('releases the ticker on destroy', () => {
        setup();
        fixture.destroy();
        expect(ticker.release).toHaveBeenCalled();
    });
});
