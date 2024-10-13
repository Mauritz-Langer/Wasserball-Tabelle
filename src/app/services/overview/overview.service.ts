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
    console.log('Original HTML:', html);

    html = html.replace(/<nobr>/g, '')
      .replace(/<\/nobr>/g, '')
      .replace(/target=_blank/g, '');
    console.log('Sanitized HTML:', html);

    let doc: Dom;

    try {
      doc = DOMParser.parseFromString(html);
      console.log('Parsed document:', doc);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return [];
    }

    const activeTab = doc.getElementById('active');
    if (!activeTab) {
      console.error('Active tab not found in the HTML.');
      return [];
    }
    console.log('Active tab:', activeTab);

    const items: Item[] = [];
    const card = activeTab.getElementsByClassName('card');
    if (!card.length) {
      console.error('No cards found in the active tab.');
      return [];
    }
    console.log('Cards found:', card);

    for (let i = 0; i < card.length; i++) {
      const itemName = card[i].childNodes[0]?.textContent;
      if (!itemName) {
        console.warn('Item name not found for card:', card[i]);
        continue;
      }
      console.log('Item name:', itemName);

      const subItems = [];
      const subItemNodes = card[i].childNodes[1]?.childNodes[0]?.childNodes;
      if (!subItemNodes) {
        console.error('Subitem nodes not found for card:', card[i]);
        continue;
      }
      console.log('Subitem nodes:', subItemNodes);

      for (let j = 0; j < subItemNodes.length; j++) {
        const subItemName = subItemNodes[j].childNodes[0]?.childNodes[0]?.textContent;
        const subItemGender = subItemNodes[j].childNodes[1]?.textContent;
        const subItemLink = subItemNodes[j].childNodes[0]?.childNodes[0]?.getAttribute('href');
        if (subItemName === 'keine aktuellen Spiele vorhanden') {
          console.warn('Skipping subitem with name "keine aktuellen Spiele vorhanden"');
          continue;
        }
        console.log('Subitem details:', { name: subItemName, gender: subItemGender, link: subItemLink });

        subItems.push({ name: subItemName, gender: subItemGender, link: subItemLink, isFavorite: false });
      }

      if (subItems.length !== 0) {
        items.push({ name: itemName, subItems: subItems });
      }
    }

    console.log('Parsed items:', items);
    return items;
  }
}
