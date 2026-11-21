import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, from, shareReplay, tap } from 'rxjs';
import { Item } from "../../models/item";
import { SubItem } from "../../models/subItem";
import { ApiProxyService } from "../api-proxy/api-proxy.service";
import { SeasonService } from "../season/season.service";
import { HistoryService } from "../history/history.service";

@Injectable({
  providedIn: 'root'
})
export class OverviewService {
  private http = inject(HttpClient);
  private apiProxy = inject(ApiProxyService);
  private seasonService = inject(SeasonService);
  private historyService = inject(HistoryService);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);


  constructor() {
  }

  // The league index changes rarely; share one request across home, league
  // browser and favourites for a few minutes.
  private cache = new Map<string, { ts: number, items$: Observable<Item[]> }>();
  private readonly cacheTtlMs = 5 * 60_000;

  getItems(forceRefresh = false): Observable<Item[]> {
    const season = this.seasonService.currentSeason();
    const cached = this.cache.get(season);
    if (!forceRefresh && cached && Date.now() - cached.ts < this.cacheTtlMs) {
      return cached.items$;
    }

    let items$: Observable<Item[]>;
    if (this.seasonService.isCurrentSeason) {
      const url = this.apiProxy.getApiUrl(`/Modules/WB/Index.aspx?Season=${this.seasonService.liveSeason()}`);
      items$ = this.http.get(url, { responseType: 'text' }).pipe(
        map(html => this.parseHtmlToItems(html)),
        tap(items => this.confirmSeason(items))
      );
    } else {
      items$ = from(this.historyService.getOverviewItems(season));
    }
    items$ = items$.pipe(shareReplay(1));
    this.cache.set(season, { ts: Date.now(), items$ });
    items$.subscribe({ error: () => { if (this.cache.get(season)?.items$ === items$) this.cache.delete(season); } });
    return items$;
  }

  /**
   * DSV's index always lists the leagues of the season that is running right
   * now — whatever `Season` we ask for. Use the season in those links as the
   * source of truth for "live".
   */
  private confirmSeason(items: Item[]): void {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const sub of item.subItems) {
        const season = sub.link.match(/Season=(\d{4})/)?.[1];
        if (season) counts.set(season, (counts.get(season) ?? 0) + 1);
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) return;
    const before = this.seasonService.liveSeason();
    this.seasonService.confirmLiveSeason(top[0]);
    if (before !== top[0]) {
      // Re-key the cached index under the corrected season.
      const entry = this.cache.get(before);
      if (entry) { this.cache.delete(before); this.cache.set(top[0], entry); }
    }
  }

  /**
   * Parse the DSV overview page into league categories.
   *
   * Robust, selector-based parsing of the live DSV markup:
   *   #active > .card           → a category (".card-header" = category name)
   *     .card-body table tr     → one league row
   *       td:first a[League.aspx]  → league name + link
   *       (that cell's next td)     → gender ("männlich"/"weiblich"/"mixed")
   * The trailing time cell may contain a "Live.aspx" countdown link, which is
   * ignored because we only match anchors pointing at League.aspx.
   */
  parseHtmlToItems(html: string): Item[] {
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch (error) {
      console.error('Error parsing overview HTML:', error);
      return [];
    }

    const active = doc.getElementById('active');
    if (!active) return [];

    const items: Item[] = [];

    for (const card of Array.from(active.querySelectorAll('.card'))) {
      const name = card.querySelector('.card-header')?.textContent?.trim();
      if (!name) continue;

      const subItems: SubItem[] = [];
      for (const row of Array.from(card.querySelectorAll('.card-body table tr'))) {
        const link = row.querySelector<HTMLAnchorElement>('a[href*="League.aspx"]');
        const subName = link?.textContent?.trim();
        const href = link?.getAttribute('href');
        if (!link || !subName || !href || subName === 'keine aktuellen Spiele vorhanden') {
          continue;
        }
        // Gender lives in the cell after the one holding the league link.
        const genderCell = link.closest('td')?.nextElementSibling;
        const gender = genderCell?.textContent?.trim() ?? '';
        // Third cell: "in 5 Tagen", "beendet", or a countdown link to the liveticker.
        const status = genderCell?.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
        subItems.push({ name: subName, gender, link: href, isFavorite: false, status });
      }

      if (subItems.length) {
        items.push({ name, subItems });
      }
    }

    return items;
  }
}
