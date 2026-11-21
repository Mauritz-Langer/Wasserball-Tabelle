import { TestBed } from '@angular/core/testing';
import { ConsentService } from './consent.service';

describe('ConsentService', () => {
    beforeEach(() => {
        localStorage.removeItem('analytics-consent');
        TestBed.configureTestingModule({});
    });

    it('starts with no decision', () => {
        const service = TestBed.inject(ConsentService);
        expect(service.decision()).toBeNull();
        expect(service.hasConsent).toBe(false);
    });

    it('grants consent and persists it', () => {
        const service = TestBed.inject(ConsentService);
        service.accept();
        expect(service.decision()).toBe('granted');
        expect(service.hasConsent).toBe(true);
        expect(localStorage.getItem('analytics-consent')).toBe('granted');
    });

    it('declines consent and persists it', () => {
        const service = TestBed.inject(ConsentService);
        service.decline();
        expect(service.decision()).toBe('denied');
        expect(service.hasConsent).toBe(false);
        expect(localStorage.getItem('analytics-consent')).toBe('denied');
    });

    it('reads a previously stored decision', () => {
        localStorage.setItem('analytics-consent', 'granted');
        const service = TestBed.inject(ConsentService);
        expect(service.decision()).toBe('granted');
    });
});
