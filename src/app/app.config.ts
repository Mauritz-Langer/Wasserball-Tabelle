import { ApplicationConfig, provideZoneChangeDetection, isDevMode, ErrorHandler, LOCALE_ID, inject, provideAppInitializer } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideServiceWorker } from '@angular/service-worker';

import { retryInterceptor } from './interceptors/retry.interceptor';
import { GlobalErrorHandler } from './services/error-handler/global-error-handler';

// Dates and numbers are formatted the German way everywhere ("Samstag, 21. November", "23.619").
registerLocaleData(localeDe);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled'
    })),
    provideHttpClient(withInterceptors([retryInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    // Rounded icon set to match the soft geometry of the UI.
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-icons-round');
    }),
    { provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, useValue: { duration: 4000 } },
    { provide: LOCALE_ID, useValue: 'de' },
    { provide: ErrorHandler, useClass: GlobalErrorHandler }
  ]
};
