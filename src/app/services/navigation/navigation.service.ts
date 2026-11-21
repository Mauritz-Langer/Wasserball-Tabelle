import { Injectable, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * In-app history and focus handling.
 *
 * - back(): goes to the previous page of this app. When a page was opened
 *   directly (link, bookmark, reload) there is nothing to go back to inside
 *   the app — then the given parent page is shown instead of leaving the app.
 * - After every change of page, focus moves to the page heading, so keyboard
 *   and screen reader users start reading the new page (and hear its title).
 */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  private router = inject(Router);
  private location = inject(Location);
  /** Pages of this app behind the current one in the browser history. */
  private depth = 0;
  private lastPath: string | null = null;

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(e => {
      const nav = this.router.lastSuccessfulNavigation();
      const path = e.urlAfterRedirects.split('?')[0];
      if (this.lastPath === null) {
        this.depth = 0; // first page of this visit
      } else if (nav?.trigger === 'popstate') {
        this.depth = Math.max(0, this.depth - 1);
      } else if (!nav?.extras.replaceUrl) {
        this.depth++;
      }
      // Query-only changes (tabs, filters) stay on the same page: keep focus.
      if (this.lastPath !== null && path !== this.lastPath) this.focusPage();
      this.lastPath = path;
    });
  }

  /** Previous page of this app, or `fallback` when the visit started here. */
  back(fallback: string | any[], queryParams?: Record<string, any>): void {
    if (this.depth > 0) {
      this.location.back();
    } else {
      const commands = typeof fallback === 'string' ? [fallback] : fallback;
      this.router.navigate(commands, { queryParams, replaceUrl: true });
    }
  }

  private focusPage(): void {
    // After the new page has rendered (headings of lazily loaded pages appear
    // a moment later; fall back to the main region).
    setTimeout(() => {
      const target = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main');
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }, 150);
  }
}
