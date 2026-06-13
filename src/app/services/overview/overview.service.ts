import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, from } from 'rxjs';
import { Item } from "../../models/item";
import { ApiProxyService } from "../api-proxy/api-proxy.service";
import { SeasonService, LIVE_SEASON } from "../season/season.service";
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

  getItems(): Observable<Item[]> {
    if (this.seasonService.isCurrentSeason) {
      const url = this.apiProxy.getApiUrl(`/Modules/WB/Index.aspx?Season=${LIVE_SEASON}`);
      return this.http.get(url, { responseType: 'text' }).pipe(
        map(html => this.parseHtmlToItems(html))
      );
    } else {
      return from(this.historyService.getOverviewItems(this.seasonService.currentSeason()));
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

      const subItems = [];
      for (const row of Array.from(card.querySelectorAll('.card-body table tr'))) {
        const link = row.querySelector<HTMLAnchorElement>('a[href*="League.aspx"]');
        const subName = link?.textContent?.trim();
        const href = link?.getAttribute('href');
        if (!link || !subName || !href || subName === 'keine aktuellen Spiele vorhanden') {
          continue;
        }
        // Gender lives in the cell after the one holding the league link.
        const gender = link.closest('td')?.nextElementSibling?.textContent?.trim() ?? '';
        subItems.push({ name: subName, gender, link: href, isFavorite: false });
      }

      if (subItems.length) {
        items.push({ name, subItems });
      }
    }

    return items;
  }
}
