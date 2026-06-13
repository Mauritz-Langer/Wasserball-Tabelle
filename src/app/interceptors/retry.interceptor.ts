import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, retry, throwError, timer } from 'rxjs';

/**
 * Retries transient GET failures (network errors / 5xx) with backoff and shows
 * a user-facing snackbar when a request ultimately fails. Without this, failed
 * data fetches just left the UI spinning silently.
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
    const snackBar = inject(MatSnackBar);
    const isRetriable = req.method === 'GET';

    return next(req).pipe(
        retry({
            count: isRetriable ? 2 : 0,
            delay: (error: HttpErrorResponse, retryCount) => {
                // Only retry network errors (status 0) or server errors (>=500).
                if (error.status === 0 || error.status >= 500) {
                    return timer(retryCount * 600);
                }
                return throwError(() => error);
            }
        }),
        catchError((error: HttpErrorResponse) => {
            // Don't nag about the lazily-probed archive databases.
            const isData = req.url.includes('/assets/data/');
            if (!isData) {
                snackBar.open(
                    'Verbindungsproblem – bitte später erneut versuchen.',
                    'OK',
                    { duration: 5000 }
                );
            }
            return throwError(() => error);
        })
    );
};
