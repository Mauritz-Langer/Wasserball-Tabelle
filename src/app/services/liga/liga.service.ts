import { Injectable, inject } from '@angular/core';
// entferne externes dom-parser Paket, nutze nativen DOMParser
import { lastValueFrom, Observable } from "rxjs";
import { HttpClient } from "@angular/common/http";
import { Games } from "../../models/games";
import { Table } from "../../models/table";
import { Scorer } from "../../models/scorer";
import { ApiProxyService } from "../api-proxy/api-proxy.service";
import { SeasonService } from "../season/season.service";
import { HistoryService } from "../history/history.service";
import { map, from } from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class LigaService {
  private http = inject(HttpClient);
  private apiProxy = inject(ApiProxyService);
  private seasonService = inject(SeasonService);
  private historyService = inject(HistoryService);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);


  constructor() {
  }

  getItems(link: string): Observable<string> {
    const url = this.apiProxy.getApiUrl('/Modules/WB/' + link);
    return this.http.get(url, { responseType: 'text' })
  }

  fetchLeagueData(link: string): Observable<{ name: string, games: Games[], table: Table[], scorers: Scorer[] }> {
    if (this.seasonService.isCurrentSeason) {
      return this.getItems(link).pipe(
        map(html => ({
          name: this.getLigaName(html),
          games: this.parseHtmlToGames(html),
          table: this.parseHtmlToTable(html),
          scorers: this.parseHtmlToScorer(html)
        }))
      );
    } else {
      return from(Promise.all([
        this.historyService.getGames(link),
        this.historyService.getTable(link),
        this.historyService.getScorer(link)
      ])).pipe(
        map(([games, table, scorers]) => ({
          name: 'Historische Liga', // TODO: Fetch real name from DB if possible
          games,
          table,
          scorers
        }))
      );
    }
  }

  getLigaName(html: string): string {
    let doc: any;
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(html, 'text/html');
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return '';
    }

    const headerLabel = doc.getElementById('ContentSection__headerLabel');
    if (!headerLabel || !headerLabel.textContent) {
      console.warn('ContentSection__headerLabel not found or has no textContent');
      return '';
    }
    return headerLabel.textContent.trim();
  }

  private extractTeamImages(doc: any): Map<string, string> {
    const teamImages = new Map<string, string>();

    let tableTable = doc.getElementById('table');

    if (!tableTable) {
      const tableLabel = doc.getElementById('ContentSection__tableLabel');
      if (tableLabel) {
        let parent = tableLabel.parentElement;
        while (parent && !parent.classList.contains('card-header')) {
          parent = parent.parentElement;
        }
        if (parent && parent.nextElementSibling) {
          tableTable = parent.nextElementSibling.querySelector('table');
        }
      }
    }

    if (tableTable) {
      const rows = tableTable.getElementsByTagName('tr');
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        if (cells.length < 10) {
          continue;
        }

        const teamText = cells[2].textContent.trim();
        const teamName = teamText.split(' - ')[0].trim();

        const imgElement = cells[1].querySelector('img');
        if (imgElement) {
          const src = imgElement.getAttribute('src');
          if (src) {
            let imageUrl = '';
            if (src.startsWith('data:')) {
              imageUrl = src;
            } else if (src.includes('base64,') || src.startsWith('svg+xml')) {
              if (src.startsWith('svg+xml;base64,')) {
                imageUrl = 'data:image/svg+xml;base64,' + src.substring(15);
              } else if (!src.startsWith('data:')) {
                imageUrl = 'data:image/' + src;
              } else {
                imageUrl = src;
              }
            } else if (src.startsWith('http')) {
              imageUrl = src;
            } else {
              imageUrl = 'https://dsvdaten.dsv.de' + (src.startsWith('/') ? '' : '/') + src;
            }
            teamImages.set(teamName, imageUrl);
          }
        }
      }
    }

    return teamImages;
  }

  parseHtmlToGames(html: string): Games[] {
    html = html.replace(/<nobr>/g, '')
      .replace(/<\/nobr>/g, '')
      .replace(/target=_blank/g, '');

    let doc: any;
    const games: Games[] = [];

    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(html, 'text/html');
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return [];
    }

    // Extrahiere Team-Bilder aus der Tabelle
    const teamImages = this.extractTeamImages(doc);

    // Neue Struktur: Suche nach der Tabelle unter ContentSection__roundLabel
    let gameTable = doc.getElementById('games');

    // Fallback: Wenn id="games" nicht existiert, suche nach der Tabelle mit der Spiele-Struktur
    if (!gameTable) {
      const roundLabel = doc.getElementById('ContentSection__roundLabel');
      if (roundLabel) {
        // Finde das card-body div nach dem roundLabel
        let parent = roundLabel.parentElement;
        while (parent && !parent.classList.contains('card-header')) {
          parent = parent.parentElement;
        }
        if (parent && parent.nextElementSibling) {
          gameTable = parent.nextElementSibling.querySelector('table');
        }
      }
    }

    if (gameTable) {
      const rows = gameTable.getElementsByTagName('tr');
      // Überspringe die erste Header-Zeile
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');

        // Überspringe Zeilen mit zu wenigen Zellen (mindestens 6 für alte Struktur)
        if (cells.length < 6) {
          continue;
        }

        // Unterscheide zwischen alter Struktur (6 Spalten) und neuer Struktur (8+ Spalten)
        let startCell, homeCell, guestCell, locationCell, resultCell;

        if (cells.length >= 8) {
          // Neue Struktur: Spalten sind: Spiel, Beginn, leer, Heim, leer, Gast, Ort, Info/Erg., (Viertelergebnisse)
          startCell = cells[1];
          homeCell = cells[3];
          guestCell = cells[5];
          locationCell = cells[6];
          resultCell = cells[7];
        } else {
          // Alte Struktur: Spalten sind: idx, Beginn, Heim, Gast, Ort, Info/Erg.
          startCell = cells[1];
          homeCell = cells[2];
          guestCell = cells[3];
          locationCell = cells[4];
          resultCell = cells[5];
        }

        let result = resultCell.textContent.trim();
        if (result === 'mehr...') {
          result = ' - ';
        }

        // Extrahiere Link falls vorhanden
        let link = '';
        const linkElement = resultCell.querySelector('a');
        if (linkElement) {
          const href = linkElement.getAttribute('href');
          if (href) {
            link = href.replace('https://dsvdaten.dsv.de/Modules/WB/', '');
          }
        }

        const homeTeam = homeCell.textContent.trim();
        const guestTeam = guestCell.textContent.trim();

        const game: Games = {
          start: startCell.textContent.trim(),
          home: homeTeam,
          homeImageUrl: teamImages.get(homeTeam) || '',
          guest: guestTeam,
          guestImageUrl: teamImages.get(guestTeam) || '',
          location: locationCell.textContent.trim(),
          gameLink: link,
          result: result
        };
        games.push(game);
      }
    }

    return games;
  }

  async getLocationLink(link: string): Promise<string> {
    const htmlResponse = await lastValueFrom(this.getItems(link));
    const parser = new DOMParser();
    const docGame: any = parser.parseFromString(htmlResponse, 'text/html');
    return docGame.getElementById('ContentSection__googleHyperLink')?.getAttribute('href') || '';
  }

  parseHtmlToTable(html: string) {
    html = html.replace(/<nobr>/g, '')
      .replace(/<\/nobr>/g, '')
      .replace(/target=_blank/g, '');

    let doc: any;
    const tables: Table[] = [];

    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(html, 'text/html');
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return [];
    }

    // Neue Struktur: Suche nach der Tabelle unter ContentSection__tableLabel
    let tableTable = doc.getElementById('table');

    // Fallback: Wenn id="table" nicht existiert, suche nach der Tabelle mit der Tabellen-Struktur
    if (!tableTable) {
      const tableLabel = doc.getElementById('ContentSection__tableLabel');
      if (tableLabel) {
        // Finde das card-body div nach dem tableLabel
        let parent = tableLabel.parentElement;
        while (parent && !parent.classList.contains('card-header')) {
          parent = parent.parentElement;
        }
        if (parent && parent.nextElementSibling) {
          tableTable = parent.nextElementSibling.querySelector('table');
        }
      }
    }

    if (tableTable) {
      const rows = tableTable.getElementsByTagName('tr');
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        if (cells.length < 10) {
          continue;
        }

        // Neue League.aspx Struktur hat eine leere Spalte (Index 1)
        // Spalte 0: Platz
        // Spalte 1: Bild (Team-Logo)
        // Spalte 2: Verein (Team-Name)
        // Spalte 3: Spiele
        // Spalte 4: S* (Siege)
        // Spalte 5: U* (Unentschieden)
        // Spalte 6: N* (Niederlagen)
        // Spalte 7: Tore
        // Spalte 8: TD* (Tordifferenz)
        // Spalte 9: Punkte

        let info = '';
        const teamText = cells[2].textContent.trim();
        if (teamText.includes(' - ')) {
          const parts = teamText.split(' - ');
          info = parts[1].trim();
        }

        // Extrahiere Bild aus Spalte 1
        let imageUrl = '';
        const imgElement = cells[1].querySelector('img');
        if (imgElement) {
          const src = imgElement.getAttribute('src');
          if (src) {
            // Prüfe ob es sich um eine Data-URL handelt
            if (src.startsWith('data:')) {
              imageUrl = src;
            }
            // Prüfe ob es eine Base64-kodierte SVG ohne data: Präfix ist
            else if (src.includes('base64,') || src.startsWith('svg+xml')) {
              // Füge den korrekten data: URI Präfix hinzu
              if (src.startsWith('svg+xml;base64,')) {
                imageUrl = 'data:image/svg+xml;base64,' + src.substring(15);
              } else if (!src.startsWith('data:')) {
                imageUrl = 'data:image/' + src;
              } else {
                imageUrl = src;
              }
            }
            // Normale URL
            else if (src.startsWith('http')) {
              imageUrl = src;
            }
            // Relative URL
            else {
              imageUrl = 'https://dsvdaten.dsv.de' + (src.startsWith('/') ? '' : '/') + src;
            }
          }
        }

        const tableElement: Table = {
          place: parseInt(cells[0].textContent.trim()),
          team: teamText.split(' - ')[0].trim(),
          info: info,
          imageUrl: imageUrl,
          games: parseInt(cells[3].textContent.trim().split('/')[0]), // "2/10" -> nimm erste Zahl
          wins: parseInt(cells[4].textContent.trim()),
          draws: parseInt(cells[5].textContent.trim()),
          losses: parseInt(cells[6].textContent.trim()),
          goals: cells[7].textContent.trim(),
          goalDifference: parseInt(cells[8].textContent.trim().replace('+', '')), // "+53" -> 53
          points: parseInt(cells[9].textContent.trim())
        };
        tables.push(tableElement);
      }
    }

    return tables;
  }

  parseHtmlToScorer(html: string): Scorer[] {
    html = html.replace(/<nobr>/g, '')
      .replace(/<\/nobr>/g, '')
      .replace(/target=_blank/g, '');

    let doc: any;
    const scorers: Scorer[] = [];

    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(html, 'text/html');
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return [];
    }

    // Neue Struktur: Suche nach der Tabelle unter ContentSection__scorerLabel
    let scorer = doc.getElementById('scorer');

    // Fallback: Wenn id="scorer" nicht existiert, suche nach der Tabelle mit der Torschützen-Struktur
    if (!scorer) {
      const scorerLabel = doc.getElementById('ContentSection__scorerLabel');
      if (scorerLabel) {
        // Finde das card-body div nach dem scorerLabel
        let parent = scorerLabel.parentElement;
        while (parent && !parent.classList.contains('card-header')) {
          parent = parent.parentElement;
        }
        if (parent && parent.nextElementSibling) {
          scorer = parent.nextElementSibling.querySelector('table');
        }
      }
    }

    if (scorer) {
      const rows = scorer.getElementsByTagName('tr');

      let lastPlace: number = 0;
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        if (cells.length < 5) {
          continue;
        }

        const placeText = cells[0].textContent.trim();
        if (placeText && !isNaN(parseInt(placeText))) {
          lastPlace = parseInt(placeText);
        }

        const scorerElement: Scorer = {
          place: lastPlace,
          name: cells[1].textContent.trim(),
          team: cells[2].textContent.trim(),
          goals: parseInt(cells[3].textContent.trim()),
          games: parseInt(cells[4].textContent.trim())
        };
        scorers.push(scorerElement);
      }
    }

    return scorers;
  }
}
