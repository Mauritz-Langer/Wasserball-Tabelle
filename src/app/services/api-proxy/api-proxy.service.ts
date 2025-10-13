import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ApiProxyService {

  /**
   * Constructs the API URL based on the environment
   * Always uses /api prefix which will be rewritten by Vercel or proxied by Angular
   */
  getApiUrl(path: string): string {
    // Simply prepend /api to the path
    // The proxy/rewrite configuration will handle the rest
    return `/api${path}`;
  }
}
