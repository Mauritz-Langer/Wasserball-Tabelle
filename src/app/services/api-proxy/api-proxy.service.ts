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

  /**
   * Resolves an image `src` from a DSV page. DSV-hosted images go through the
   * same-origin proxy: they are edge-cached, and the app may read their pixels
   * (LogoFallbackDirective trims and checks logos on a canvas).
   */
  assetUrl(src: string | null | undefined): string {
    if (!src) return '';
    if (src.startsWith('data:')) return src;
    if (src.includes('base64,')) return 'data:image/' + src;
    const dsv = src.match(/^https?:\/\/dsvdaten\.dsv\.de(\/.*)$/i);
    if (dsv) return this.getApiUrl(dsv[1]);
    if (/^https?:/i.test(src)) return src;
    return this.getApiUrl(src.startsWith('/') ? src : '/Modules/WB/' + src);
  }
}
