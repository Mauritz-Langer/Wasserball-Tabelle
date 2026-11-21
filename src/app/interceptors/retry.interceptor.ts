import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

/**
 * Retries transient GET failures with backoff: network errors, 5xx, and 429
 * (DSV throttles bursts — waiting a moment is all it takes). Requests that
 * still fail are reported by the page that asked for them, which knows what
 * to offer instead (retry button, empty state).
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
    if (req.method !== 'GET') return next(req);

    return next(req).pipe(
        retry({
            count: 2,
            delay: (error: HttpErrorResponse, retryCount) => {
                if (error.status === 429) return timer(retryCount * 2500);
                if (error.status === 0 || error.status >= 500) return timer(retryCount * 600);
                return throwError(() => error);
            }
        })
    );
};
