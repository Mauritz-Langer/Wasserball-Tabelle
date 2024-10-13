import {Injectable} from '@angular/core';
import {Dom} from "dom-parser";
import * as DOMParser from "dom-parser";
import {lastValueFrom, Observable} from "rxjs";
import {HttpClient} from "@angular/common/http";
import {Games} from "../../models/games";
import {Table} from "../../models/table";
import {Scorer} from "../../models/scorer";

@Injectable({
  providedIn: 'root'
})
export class LigaService {

  private url = '/api/Modules/WB/'; // Replace with your URL

  constructor(private http: HttpClient) {
  }

  getItems(link: string): Observable<string> {
    return this.http.get(this.url + link, {responseType: 'text'})
  }

  getLigaName(html: string): string {
    let doc: Dom;
    try {
      doc = DOMParser.parseFromString(html);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return '';
    }

    return doc.getElementById('ContentSection__headerLabel')!.textContent.trim();
  }

  parseHtmlToGames(html: string): Games[] {
    html = html.replace(/<nobr>/g, '')
      .replace(/<\/nobr>/g, '')
      .replace(/target=_blank/g, '');

    let doc: Dom;

    const games: Games[] = [];

    try {
      doc = DOMParser.parseFromString(html);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return [];
    }

    const gameTable = doc.getElementById('games');

    if (gameTable) {
      const rows = gameTable.getElementsByTagName('tr');
      for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        if (cells.length < 5) {
          continue;
        }

        const result = cells[5].textContent.trim() == 'mehr...' ? ' - ' : cells[5].textContent.trim();

        const link = cells[5].childNodes[0].getAttribute('href').replace('https://dsvdaten.dsv.de/Modules/WB/', '');

        const game: Games = {
          start: cells[1].textContent.trim(),
          home: cells[2].textContent.trim(),
          guest: cells[3].textContent.trim(),
          location: cells[4].textContent.trim(),
          gameLink: link,
          result: result
        }
        games.push(game);
      }
    }

    return games;
  }

  async getLocationLink(link: string): Promise<string> {
    const htmlResponse = await lastValueFrom(this.getItems(link));
    const docGame = DOMParser.parseFromString(htmlResponse);
    return docGame.getElementById('ContentSection__googleHyperLink')?.getAttribute('href') || '';
  }

  parseHtmlToTable(html: string) {
    html = html.replace(/<nobr>/g, '')
      .replace(/<\/nobr>/g, '')
      .replace(/target=_blank/g, '');

    let doc: Dom;

    const tables: Table[] = [];

    try {
      doc = DOMParser.parseFromString(html);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return [];
    }

    const tableTable = doc.getElementById('table');

    if (tableTable) {
      const rows = tableTable.getElementsByTagName('tr');
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        if (cells.length < 5) {
          continue;
        }

        const tableElement: Table = {
          place: parseInt(cells[0].textContent.trim()),
          team: cells[1].textContent.split('-')[0].trim(),
          info: cells[1].textContent.split('-')[1].trim(),
          games: parseInt(cells[2].textContent.trim()),
          wins: parseInt(cells[3].textContent.trim()),
          draws: parseInt(cells[4].textContent.trim()),
          losses: parseInt(cells[5].textContent.trim()),
          goals: cells[6].textContent.trim(),
          goalDifference: parseInt(cells[7].textContent.trim()),
          points: parseInt(cells[8].textContent.trim())
        }
        tables.push(tableElement);
      }
    }

    return tables;
  }

  parseHtmlToScorer(html: string): Scorer[] {
    html = html.replace(/<nobr>/g, '')
      .replace(/<\/nobr>/g, '')
      .replace(/target=_blank/g, '');

    let doc: Dom;

    const scorers: Scorer[] = [];

    try {
      doc = DOMParser.parseFromString(html);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return [];
    }

    const scorer = doc.getElementById('scorer');

    if (scorer) {
      const rows = scorer.getElementsByTagName('tr');

      let lastPlace: number = 0;
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        if (cells.length < 5) {
          continue;
        }

        if (!isNaN(parseInt(cells[0].textContent))) {
          lastPlace = parseInt(cells[0].textContent.trim());
        }

        const scorerElement: Scorer = {
          place: lastPlace,
          name: cells[1].textContent.trim(),
          team: cells[2].textContent.trim(),
          goals: parseInt(cells[3].textContent.trim()),
          games: parseInt(cells[4].textContent.trim())
        }
        scorers.push(scorerElement);
      }
    }

    return scorers;
  }
}
