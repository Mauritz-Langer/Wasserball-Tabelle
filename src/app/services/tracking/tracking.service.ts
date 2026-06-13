import { Injectable, inject } from '@angular/core';
import * as amplitude from '@amplitude/unified';
import { ConsentService } from '../consent/consent.service';

const AMPLITUDE_API_KEY = '106978c8b7e8e15d1a519bf6fda3175d';

/**
 * Central wrapper around Amplitude. All tracking goes through here so it can be
 * gated on the user's consent (GDPR): events are dropped unless the user has
 * explicitly opted in and the SDK has been initialised.
 */
@Injectable({ providedIn: 'root' })
export class TrackingService {
    private consent = inject(ConsentService);
    private initialized = false;

    /** Initialise Amplitude. Only call after consent has been granted. */
    init(): void {
        if (this.initialized) return;
        amplitude.initAll(AMPLITUDE_API_KEY, {
            analytics: { autocapture: true },
            sessionReplay: { sampleRate: 0.1 }
        });
        this.initialized = true;
    }

    /** Track an event — no-op unless the user consented and the SDK is ready. */
    track(event: string, props?: Record<string, any>): void {
        if (!this.consent.hasConsent || !this.initialized) return;
        amplitude.track(event, props);
    }
}
