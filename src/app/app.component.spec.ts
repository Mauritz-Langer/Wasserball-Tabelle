import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app.component';
import { SeasonService } from './services/season/season.service';
import { ThemeService } from './services/theme/theme.service';
import { ConsentService } from './services/consent/consent.service';
import { TrackingService } from './services/tracking/tracking.service';
import { LiveTickerService } from './services/live-ticker/live-ticker.service';
import { TickerStub } from './testing/ticker.stub';

describe('AppComponent', () => {
    let fixture: ComponentFixture<AppComponent>;
    let component: AppComponent;
    let tracking: MockedObject<TrackingService>;
    let ticker: TickerStub;

    beforeEach(() => {
        localStorage.removeItem('analytics-consent');
        localStorage.removeItem('app-theme');
        tracking = {
            init: vi.fn().mockName("TrackingService.init"),
            track: vi.fn().mockName("TrackingService.track")
        } as unknown as MockedObject<TrackingService>;
        ticker = new TickerStub();
        TestBed.configureTestingModule({
            imports: [AppComponent],
            providers: [
                provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
                { provide: TrackingService, useValue: tracking },
                { provide: LiveTickerService, useValue: ticker }
            ]
        });
        fixture = TestBed.createComponent(AppComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    afterEach(() => {
        localStorage.removeItem('analytics-consent');
        localStorage.removeItem('app-theme');
    });

    it('renders top bar and bottom navigation with all four areas', () => {
        const el: HTMLElement = fixture.nativeElement;
        expect(el.querySelector('.brand-title')?.textContent).toContain('Wasserball');
        const labels = Array.from(el.querySelectorAll('.bottom-nav a > span:last-child')).map(a => a.textContent?.trim());
        expect(labels).toEqual(['Start', 'Ligen', 'Live', 'Statistik']);
    });

    it('does not track before consent and starts tracking on accept', () => {
        expect(tracking.init).not.toHaveBeenCalled();
        expect(fixture.nativeElement.querySelector('.consent-banner')).toBeTruthy();
        component.acceptConsent();
        fixture.detectChanges();
        expect(tracking.init).toHaveBeenCalled();
        expect(TestBed.inject(ConsentService).decision()).toBe('granted');
        expect(fixture.nativeElement.querySelector('.consent-banner')).toBeNull();
    });

    it('remembers a declined consent', () => {
        component.declineConsent();
        expect(TestBed.inject(ConsentService).decision()).toBe('denied');
        expect(tracking.init).not.toHaveBeenCalled();
    });

    it('marks archive seasons and leads back to the live season', () => {
        const seasons = TestBed.inject(SeasonService);
        component.selectSeason('2015');
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.archive-strip')).toBeTruthy();
        component.backToLiveSeason();
        fixture.detectChanges();
        expect(seasons.isLive()).toBe(true);
        expect(fixture.nativeElement.querySelector('.archive-strip')).toBeNull();
    });

    it('cycles the theme light, dark, system', () => {
        const theme = TestBed.inject(ThemeService);
        theme.setTheme('light');
        component.toggleTheme();
        expect(theme.currentTheme()).toBe('dark');
        component.toggleTheme();
        expect(theme.currentTheme()).toBe('auto');
        expect(component.getThemeLabel()).toBe('Wie System');
    });

    it('shows the number of live games on the Live tab', () => {
        expect(component.liveCount()).toBe(0);
        ticker.liveGames.set([{ Season: 2026, LeagueID: 1, Gruppe: '', LeagueKind: 'V', GameID: 1, LiveShortText: '1:0' }]);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.bottom-nav .live-count')?.textContent).toContain('1');
    });
});
