import { Injectable, inject } from '@angular/core';
import { ConsentService } from '../consent/consent.service';

const AMPLITUDE_API_KEY = '106978c8b7e8e15d1a519bf6fda3175d';

type Amplitude = typeof import('@amplitude/unified');

/**
 * Central wrapper around Amplitude. All tracking goes through here so it can be
 * gated on the user's consent (GDPR): events are dropped unless the user has
 * explicitly opted in.
 *
 * The SDK is loaded on demand — visitors who decline (or have not decided yet)
 * never download it.
 */
@Injectable({ providedIn: 'root' })
export class TrackingService {
    private consent = inject(ConsentService);
    private sdk: Promise<Amplitude | null> | null = null;

    /** Initialise Amplitude. Only call after consent has been granted. */
    init(): void {
        if (this.sdk) return;
        this.sdk = import('@amplitude/unified')
            .then(amplitude => {
                amplitude.initAll(AMPLITUDE_API_KEY, {
                    analytics: { autocapture: true },
                    sessionReplay: { sampleRate: 0.1 }
                });
                return amplitude;
            })
            .catch(e => {
                console.warn('Analytics konnte nicht geladen werden:', e);
                return null;
            });
    }

    /** Track an event — no-op unless the user consented and the SDK is ready. */
    track(event: string, props?: Record<string, any>): void {
        if (!this.consent.hasConsent || !this.sdk) return;
        this.sdk.then(amplitude => amplitude?.track(event, props));
    }
}
