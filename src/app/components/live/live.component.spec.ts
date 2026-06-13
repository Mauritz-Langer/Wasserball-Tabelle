import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { LiveComponent } from './live.component';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { LiveGame, LivePlay } from '../../models/live';

describe('LiveComponent', () => {
    let component: LiveComponent;

    beforeEach(async () => {
        const liveStub = {
            state: signal('idle'),
            liveGames: signal<LiveGame[]>([]),
            currentGame: signal<LiveGame | null>(null),
            plays: signal<LivePlay[]>([]),
            clock: signal(''),
            liveKeys: signal(new Set<string>()),
            liveNowKeys: signal(new Set<string>()),
            connect: jasmine.createSpy('connect'),
            disconnect: jasmine.createSpy('disconnect'),
            watchGame: jasmine.createSpy('watchGame'),
            watchByKey: jasmine.createSpy('watchByKey'),
            findByKey: jasmine.createSpy('findByKey'),
            unwatch: jasmine.createSpy('unwatch'),
            statusOf: (g: any) =>
                g.LiveShortCSS === 'magenta' ? 'live' : (g.LiveShortCSS === 'black' ? 'finished' : 'upcoming')
        };

        await TestBed.configureTestingModule({
            imports: [LiveComponent],
            providers: [provideRouter([]), { provide: LiveTickerService, useValue: liveStub }]
        }).compileComponents();

        const fixture = TestBed.createComponent(LiveComponent);
        component = fixture.componentInstance;
    });

    it('prefers ScoreText over the 255 sentinel in HomeGoals', () => {
        const game = { ScoreText: '18:14', HomeGoals: 255, GuestGoals: 255, HomeGoalsFinal: 18, GuestGoalsFinal: 14 } as LiveGame;
        expect(component.score(game)).toBe('18:14');
    });

    it('falls back to the Final fields when ScoreText is missing', () => {
        const game = { HomeGoals: 255, GuestGoals: 255, HomeGoalsFinal: 7, GuestGoalsFinal: 3 } as LiveGame;
        expect(component.score(game)).toBe('7:3');
    });

    it('formats event time and period markers', () => {
        expect(component.eventTime({ Period: 4, EventTime: '1900-01-01T00:08:30' } as LivePlay)).toBe('08:30');
        expect(component.eventTime({ Period: 7, EventTime: 'x' } as LivePlay)).toBe('5m');
        expect(component.eventTime({ Period: 8, EventTime: 'x' } as LivePlay)).toBe('EW');
    });

    it('detects goal plays via EventKey', () => {
        expect(component.isGoal({ EventKey: 'T' } as LivePlay)).toBeTrue();
        expect(component.isGoal({ EventKey: 'S' } as LivePlay)).toBeFalse();
        expect(component.isGoal({ EventKey: 'A' } as LivePlay)).toBeFalse();
    });

    it('side of a play follows the cap-number field', () => {
        expect(component.playSide({ GamePlanHome: '5', GamePlanGuest: '' } as LivePlay)).toBe('home');
        expect(component.playSide({ GamePlanHome: '', GamePlanGuest: '3' } as LivePlay)).toBe('guest');
        expect(component.playSide({ GamePlanHome: '', GamePlanGuest: '' } as LivePlay)).toBeNull();
    });

    it('splits quarter breakdown from ScorePeriods', () => {
        expect(component.quarters({ ScorePeriods: '(5:4, 2:4, 4:3, 7:3)' } as LiveGame)).toEqual(['5:4', '2:4', '4:3', '7:3']);
        expect(component.quarters({ ScorePeriods: '' } as LiveGame)).toEqual([]);
    });
});
