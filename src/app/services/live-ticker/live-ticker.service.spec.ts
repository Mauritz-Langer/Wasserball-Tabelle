import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { LiveTickerService } from './live-ticker.service';
import { LiveGame } from '../../models/live';

describe('LiveTickerService.statusOf', () => {
    let service: LiveTickerService;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient()] });
        service = TestBed.inject(LiveTickerService);
    });

    it('treats magenta + score as live', () => {
        expect(service.statusOf({ LiveShortCSS: 'magenta', LiveShortText: '12:31', Active: true } as LiveGame)).toBe('live');
    });

    it('treats "Spielende"/black + score as finished', () => {
        expect(service.statusOf({ LiveShortCSS: 'black', LiveShortText: '3:10', LiveDetailText: 'Spielende (12:28 Uhr): 3 : 10' } as LiveGame)).toBe('finished');
    });

    it('treats a kickoff time as upcoming', () => {
        expect(service.statusOf({ LiveShortCSS: 'magenta', LiveShortText: 'So 09:00 Uhr' } as LiveGame)).toBe('upcoming');
    });
});
