import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import * as DOMParser from 'dom-parser';
import {Item} from "../../models/item";
import {Dom} from "dom-parser";

@Injectable({
  providedIn: 'root'
})
export class OverviewService {

  private url = '/api/Modules/WB/Index.aspx?Season=2024'; // Replace with your URL

  constructor(private http: HttpClient) {
  }

  getItems(): Observable<string> {
    return this.http.get(this.url, {responseType: 'text'})
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
          // Log the sub
          subItems.push({name: subItemName, gender: subItemGender, link: subItemLink, isFavorite: false});
        }

        if (subItems.length !== 0) {
          items.push({name: itemName, subItems: subItems});
        }
      }
    } // Log the items

    return items;
  }
}
