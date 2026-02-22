import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, from } from 'rxjs';
import * as DOMParser from 'dom-parser';
import { Item } from "../../models/item";
import { Dom } from "dom-parser";
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

  getItems(): Observable<Item[]> {
    if (this.seasonService.isCurrentSeason) {
      const url = this.apiProxy.getApiUrl('/Modules/WB/Index.aspx?Season=2025');
      return this.http.get(url, { responseType: 'text' }).pipe(
        map(html => this.parseHtmlToItems(html))
      );
    } else {
      return from(this.historyService.getOverviewItems(this.seasonService.currentSeason()));
    }
  }

  parseHtmlToItems(html: string): Item[] {
    html = html.replace(/<nobr>/g, '')
      .replace(/<\/nobr>/g, '')
      .replace(/target=_blank/g, '');

    let doc: Dom;

    try {
      doc = DOMParser.parseFromString(html);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return [];
    }
    const activeTab = doc.getElementById('active');
    const items: Item[] = [];

    if (activeTab) {
      const card = activeTab.getElementsByClassName('card');

      for (let i = 0; i < card.length; i++) {
        const itemName = card[i].childNodes[0].textContent;
        if (!itemName) {
          continue;
        }

        const subItems = [];

        for (let j = 0; j < card[i].childNodes[1].childNodes[0].childNodes.length; j++) {
          const subItemName = card[i].childNodes[1].childNodes[0].childNodes[j].childNodes[0].childNodes[0].textContent;
          const subItemGender = card[i].childNodes[1].childNodes[0].childNodes[j].childNodes[1].textContent;
          const subItemLink = card[i].childNodes[1].childNodes[0].childNodes[j].childNodes[0].childNodes[0].getAttribute('href');
          if (subItemName === 'keine aktuellen Spiele vorhanden') {
            continue;
          }
          subItems.push({ name: subItemName, gender: subItemGender, link: subItemLink, isFavorite: false });
        }

        if (subItems.length !== 0) {
          items.push({ name: itemName, subItems: subItems });
        }
      }
    } // Log the items

    return items;
  }
}
