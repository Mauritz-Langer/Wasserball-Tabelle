import { ApplicationConfig, provideZoneChangeDetection, isDevMode, ErrorHandler } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideServiceWorker } from '@angular/service-worker';

import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { retryInterceptor } from './interceptors/retry.interceptor';
import { GlobalErrorHandler } from './services/error-handler/global-error-handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled'
    })),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([retryInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    provideCharts(withDefaultRegisterables()),
    { provide: ErrorHandler, useClass: GlobalErrorHandler }
  ]
};
