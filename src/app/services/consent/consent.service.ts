import { Injectable, signal } from '@angular/core';

export type ConsentDecision = 'granted' | 'denied';

const STORAGE_KEY = 'analytics-consent';

/**
 * Stores the user's analytics/tracking consent (GDPR). Amplitude is only
 * initialised after explicit consent — see AppComponent.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
    /** null = no decision yet (show the banner). */
    readonly decision = signal<ConsentDecision | null>(this.readStored());

    private readStored(): ConsentDecision | null {
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            return v === 'granted' || v === 'denied' ? v : null;
        } catch {
            return null;
        }
    }

    private store(decision: ConsentDecision): void {
        try {
            localStorage.setItem(STORAGE_KEY, decision);
        } catch {
            /* storage unavailable – keep in-memory only */
        }
    }

    get hasConsent(): boolean {
        return this.decision() === 'granted';
    }

    accept(): void {
        this.store('granted');
        this.decision.set('granted');
    }

    decline(): void {
        this.store('denied');
        this.decision.set('denied');
    }
}
