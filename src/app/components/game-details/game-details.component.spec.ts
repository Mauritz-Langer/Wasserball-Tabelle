import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { GameDetailsComponent, detailsFromTicker } from './game-details.component';
import { GameDetailsService } from '../../services/game-details/game-details.service';
import { LigaService } from '../../services/liga/liga.service';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { LIVE_SEASON, SeasonService } from '../../services/season/season.service';
import { HistoryService } from '../../services/history/history.service';
import { TickerStub } from '../../testing/ticker.stub';
import { makeDetails, makeLeague } from '../../testing/fixtures';
import { GameDetails } from '../../models/game-details';

describe('GameDetailsComponent', () => {
    let fixture: ComponentFixture<GameDetailsComponent>;
    let component: GameDetailsComponent;
    let ticker: TickerStub;
    const season = LIVE_SEASON;
    const param = `Game.aspx?Season=${LIVE_SEASON}&LeagueID=9&Group=&LeagueKind=V&GameID=1`;

    function setup(details: GameDetails | 'fail' = makeDetails(), extra: Record<string, string> = {}) {
        const gameService = {
            getGameData: vi.fn().mockName("GameDetailsService.getGameData"),
            parseHtmlToGameDetails: vi.fn().mockName("GameDetailsService.parseHtmlToGameDetails")
        };
        gameService.getGameData.mockReturnValue(details === 'fail' ? throwError(() => new Error('x')) : of('<html></html>'));
        if (details !== 'fail')
            gameService.parseHtmlToGameDetails.mockReturnValue(details);
        const ligaService = {
            fetchLeagueData: vi.fn().mockName("LigaService.fetchLeagueData")
        };
        ligaService.fetchLeagueData.mockReturnValue(of(makeLeague()));
        ticker = new TickerStub();

        TestBed.configureTestingModule({
            imports: [GameDetailsComponent],
            providers: [
                provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
                { provide: GameDetailsService, useValue: gameService },
                { provide: LigaService, useValue: ligaService },
                { provide: LiveTickerService, useValue: ticker },
                { provide: ActivatedRoute, useValue: { queryParams: new BehaviorSubject({ param, ...extra }) } }
            ]
        });
        fixture = TestBed.createComponent(GameDetailsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    const liveEntry = () => ({
        Season: +season, LeagueID: 9, Gruppe: '', LeagueKind: 'V', GameID: 1,
        LiveShortText: '5:4', ScoreText: '5:4', ScorePeriods: '(3:2, 2:2)'
    });

    it('shows a finished game with score and quarters', () => {
        setup();
        expect(component.status()).toBe('finished');
        expect(component.score()).toEqual([2, 1]);
        expect(component.quarters()).toEqual(['1:1', '1:0']);
        expect(fixture.nativeElement.querySelector('.board-score').textContent.replace(/\s/g, '')).toBe('2:1');
        expect(component.ligaParam()).toBe(`League.aspx?Season=${season}&LeagueID=9&Group=&LeagueKind=V`);
    });

    it('builds the timeline per quarter without period markers', () => {
        setup();
        const periods = component.periods();
        expect(periods.map(p => p.label)).toEqual(['1. Viertel', '2. Viertel']);
        expect(periods[0].score).toBe('1:1');
        expect(periods[0].events.length).toBe(2);
        expect(periods[0].events[0]).toEqual(expect.objectContaining({ side: 'guest', cap: '7', goal: true, score: '0:1', label: 'Tor' }));
        expect(periods[1].events[0].label).toBe('Ausschluss');
    });

    it('infers the scoring side when the report has no cap column (archive)', () => {
        const d = makeDetails();
        d.events.forEach(e => { delete e.side; delete e.cap; });
        setup(d);
        expect(component.periods()[0].events.map(e => e.side)).toEqual(['guest', 'home']);
    });

    it('draws the lead chart from the countdown clock', () => {
        setup();
        const chart = component.leadChart()!;
        expect(chart).toBeTruthy();
        expect(chart.maxLead).toBe(2);
        // First goal after 30 s of 32 min: x = 30 / 1920 * 320 = 5
        expect(chart.path).toContain('L5 48');
    });

    it('compares the teams of this game', () => {
        setup();
        const rows = component.compareRows();
        expect(rows.find(r => r.label === 'Tore')).toEqual(expect.objectContaining({ home: '2', guest: '1' }));
        expect(rows.find(r => r.label === 'Ausschlüsse')).toEqual(expect.objectContaining({ home: '1', guest: '0' }));
        expect(component.topScorers()[0].name).toBe('Muster, Max');
    });

    it('adds league context: standings, form and other meetings', () => {
        setup();
        const ctx = component.teamContext()!;
        expect(ctx.home).toEqual(expect.objectContaining({ place: 1, points: 3, form: ['W'] }));
        expect(ctx.guest.form).toEqual(['D', 'L']);
        expect(component.meetings().length).toBe(0); // the only Alpha–Beta game is this one
        expect(component.tabs().map(t => t.id)).toEqual(['verlauf', 'aufstellung', 'vergleich', 'info']);
    });

    it('treats a game without result or events as upcoming', () => {
        setup(makeDetails({ finalScore: '0:0', events: [], quarterScores: [], startDate: '01.10.2099 18:00 Uhr' }));
        expect(component.status()).toBe('upcoming');
        expect(component.score()).toBeNull();
        expect(component.activeTab()).toBe('aufstellung');
        expect(fixture.nativeElement.textContent).toContain('In den Kalender');
    });

    it('switches to live mode when the ticker has the game', () => {
        setup(makeDetails({ finalScore: '0:0', events: [], quarterScores: [] }));
        ticker.liveGames.set([liveEntry()]);
        ticker.plays.set([{
                Season: +season, LeagueID: 9, Gruppe: '', LeagueKind: 'V', GameID: 1, Number: 1, Period: 2,
                EventTime: '1900-01-01T00:03:14', GamePlanGuest: '4', GamePlanPlayer: 'Beispiel, B.', EventKey: 'T', LiveGoals: '5:4', Active: true
            }]);
        fixture.detectChanges();
        expect(component.status()).toBe('live');
        expect(component.score()).toEqual([5, 4]);
        expect(component.quarters()).toEqual(['3:2', '2:2']);
        expect(ticker.watchByKey).toHaveBeenCalled();
        expect(component.livePlays()[0]).toEqual(expect.objectContaining({ side: 'guest', cap: '4', time: '3:14', goal: true, score: '5:4' }));
        expect(component.showLiveFeed()).toBe(true);
    });

    it('stops watching and releases the ticker on destroy', () => {
        setup();
        ticker.liveGames.set([liveEntry()]);
        fixture.detectChanges();
        fixture.destroy();
        expect(ticker.unwatch).toHaveBeenCalled();
        expect(ticker.release).toHaveBeenCalled();
    });

    it('marks goalkeeper caps', () => {
        setup();
        expect(component.isKeeper('1')).toBe(true);
        expect(component.isKeeper('13')).toBe(true);
        expect(component.isKeeper('5')).toBe(false);
    });

    it('shows an error with retry when the report cannot be loaded', () => {
        setup('fail');
        expect(component.error()).toBeTruthy();
        expect(fixture.nativeElement.textContent).toContain('Spiel nicht verfügbar');
    });

    it('derives league and season of an archive game from its id', () => {
        const history = {
            getGameDetails: vi.fn().mockName("HistoryService.getGameDetails")
        };
        history.getGameDetails.mockResolvedValue(makeDetails());
        TestBed.resetTestingModule();
        const ligaService = {
            fetchLeagueData: vi.fn().mockName("LigaService.fetchLeagueData")
        };
        ligaService.fetchLeagueData.mockReturnValue(of(makeLeague()));
        TestBed.configureTestingModule({
            imports: [GameDetailsComponent],
            providers: [
                provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
                { provide: HistoryService, useValue: history },
                { provide: LigaService, useValue: ligaService },
                { provide: LiveTickerService, useValue: new TickerStub() },
                { provide: ActivatedRoute, useValue: { queryParams: new BehaviorSubject({ param: '2023_297_P_10' }) } }
            ]
        });
        const f = TestBed.createComponent(GameDetailsComponent);
        f.detectChanges();
        expect(f.componentInstance.ligaParam()).toBe('2023_297_P');
        expect(TestBed.inject(SeasonService).currentSeason()).toBe('2023');
        expect(history.getGameDetails).toHaveBeenCalledWith('2023_297_P_10');
    });

    it('opens the tab requested in the URL', () => {
        setup(makeDetails(), { tab: 'info' });
        expect(component.activeTab()).toBe('info');
        expect(fixture.nativeElement.textContent).toContain('Kampfgericht');
    });
});

describe('detailsFromTicker', () => {
  it('builds a minimal report from a liveticker entry', () => {
    const d = detailsFromTicker({
      Season: 2026, LeagueID: 307, Gruppe: 'B', LeagueKind: 'V', GameID: 2,
      HomeClubname: 'Hamburger TB von 1862 III', GuestClubname: 'SV Poseidon Hamburg III',
      ScorePeriods: '(2:1, 0:3)', StartDate: '2026-11-18T20:15:00', PoolName: 'Schwimmhalle Inselpark',
      LeagueNameLive: 'Hamburger Wasserball Liga - Gruppe B'
    });
    expect(d.homeTeam.name).toBe('Hamburger TB von 1862 III');
    expect(d.guestTeam.name).toBe('SV Poseidon Hamburg III');
    expect(d.quarterScores).toEqual([{ quarter: 1, home: 2, guest: 1 }, { quarter: 2, home: 0, guest: 3 }]);
    expect(d.startDate).toBe('2026-11-18T20:15:00');
    expect(d.venue.poolName).toBe('Schwimmhalle Inselpark');
    expect(d.events).toEqual([]);
  });
});
