import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TrackingService } from '../tracking/tracking.service';

/**
 * Catches otherwise-unhandled errors, logs them, reports them to analytics
 * (only with consent, via TrackingService) and shows a non-intrusive snackbar
 * so the user isn't left staring at a frozen UI.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
    private zone = inject(NgZone);
    private snackBar = inject(MatSnackBar);
    private tracking = inject(TrackingService);

    handleError(error: any): void {
        console.error('Unhandled error:', error);

        this.tracking.track('Error Occurred', {
            errorMessage: error?.message ?? String(error),
            errorContext: 'global'
        });

        // Snackbar must be opened inside Angular's zone.
        this.zone.run(() => {
            this.snackBar.open('Es ist ein Fehler aufgetreten.', 'OK', { duration: 5000 });
        });
    }
}
