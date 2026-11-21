import { Injectable, inject } from '@angular/core';
import { lastValueFrom, Observable } from "rxjs";
import { HttpClient } from "@angular/common/http";
import { Games } from "../../models/games";
import { Table } from "../../models/table";
import { Scorer } from "../../models/scorer";
import { ApiProxyService } from "../api-proxy/api-proxy.service";
import { SeasonService } from "../season/season.service";
import { HistoryService } from "../history/history.service";
import { map, from, shareReplay } from "rxjs";

export interface LeagueData { name: string; games: Games[]; table: Table[]; scorers: Scorer[]; }

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

  // Short-lived session cache so navigating back to a league doesn't re-fetch
  // and re-parse. TTL keeps live scores reasonably fresh.
  private cache = new Map<string, { ts: number, data$: Observable<LeagueData>, value?: LeagueData }>();
  private readonly cacheTtlMs = 60_000;
  private readonly maxCacheEntries = 12;

  fetchLeagueData(link: string, forceRefresh = false): Observable<LeagueData> {
    const key = this.seasonService.currentSeason() + '|' + link;
    const cached = this.cache.get(key);
    if (!forceRefresh && cached && Date.now() - cached.ts < this.cacheTtlMs) {
      return cached.data$;
    }

    const data$ = this.buildLeagueData(link).pipe(shareReplay(1));
    const entry = { ts: Date.now(), data$, value: cached?.value };
    this.cache.delete(key);
    if (this.cache.size >= this.maxCacheEntries) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
    this.cache.set(key, entry);
    data$.subscribe({
      next: value => { entry.value = value; },
      // A failed refresh keeps the previous data but is retried next time.
      error: () => { if (this.cache.get(key) === entry) { entry.ts = 0; if (!entry.value) this.cache.delete(key); } }
    });
    return data$;
  }

  /**
   * The last data seen for a league in this session, however old. Lets a
   * page render at once (and restore its scroll position) while fresh data
   * is fetched in the background.
   */
  peek(link: string): LeagueData | null {
    return this.cache.get(this.seasonService.currentSeason() + '|' + link)?.value ?? null;
  }

  private buildLeagueData(link: string): Observable<LeagueData> {
    // The link decides where the data comes from: DSV pages are "League.aspx?…",
    // archive leagues an id like "2023_302" — whatever season is selected.
    if (!HistoryService.isHistoricalLeagueId(link)) {
      return this.getItems(link).pipe(map(html => this.parseLeague(html)));
    } else {
      return from(Promise.all([
        this.historyService.getLeagueName(link),
        this.historyService.getGames(link),
        this.historyService.getTable(link),
        this.historyService.getScorer(link)
      ])).pipe(
        map(([name, games, table, scorers]) => ({ name, games, table, scorers }))
      );
    }
  }

  /** Parse a complete League.aspx page with a single DOM pass. */
  parseLeague(html: string): LeagueData {
    const doc = this.toDoc(html);
    if (!doc) return { name: '', games: [], table: [], scorers: [] };
    const games = this.gamesFromDoc(doc);
    return {
      name: this.nameFromDoc(doc),
      games,
      table: this.tableFromDoc(doc, this.logosFromGames(games)),
      scorers: this.scorersFromDoc(doc)
    };
  }

  private toDoc(html: string): Document | null {
    html = html.replace(/<nobr>/g, '')
      .replace(/<\/nobr>/g, '')
      .replace(/target=_blank/g, '');
    try {
      return new DOMParser().parseFromString(html, 'text/html');
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return null;
    }
  }

  getLigaName(html: string): string {
    const doc = this.toDoc(html);
    return doc ? this.nameFromDoc(doc) : '';
  }

  private nameFromDoc(doc: Document): string {
    return doc.getElementById('ContentSection__headerLabel')?.textContent?.trim() ?? '';
  }

  /**
   * Resolve a DSV image reference to something an <img> can load: data URIs,
   * absolute URLs, or handler paths relative to /Modules/WB/ (the page's dir).
   */
  private resolveImage(src: string | null | undefined): string {
    return this.apiProxy.assetUrl(src);
  }

  /** Find a section's table: by container id first, then via its header label. */
  private sectionTable(doc: Document, containerId: string, labelId: string): Element | null {
    const container = doc.getElementById(containerId);
    if (container) return container.tagName === 'TABLE' ? container : (container.querySelector('table') ?? container);
    let parent = doc.getElementById(labelId)?.parentElement ?? null;
    while (parent && !parent.classList.contains('card-header')) parent = parent.parentElement;
    return parent?.nextElementSibling?.querySelector('table') ?? null;
  }

  private logosFromGames(games: Games[]): Map<string, string> {
    const logos = new Map<string, string>();
    for (const g of games) {
      if (g.homeImageUrl && !logos.has(g.home)) logos.set(g.home, g.homeImageUrl);
      if (g.guestImageUrl && !logos.has(g.guest)) logos.set(g.guest, g.guestImageUrl);
    }
    return logos;
  }

  parseHtmlToGames(html: string): Games[] {
    const doc = this.toDoc(html);
    if (!doc) return [];
    const games = this.gamesFromDoc(doc);
    // Older pages carry logos only in the standings table.
    const tableLogos = new Map(this.tableFromDoc(doc, new Map()).filter(t => t.imageUrl).map(t => [t.team, t.imageUrl]));
    for (const g of games) {
      g.homeImageUrl ||= tableLogos.get(g.home) ?? '';
      g.guestImageUrl ||= tableLogos.get(g.guest) ?? '';
    }
    return games;
  }

  private gamesFromDoc(doc: Document): Games[] {
    const games: Games[] = [];
    const gameTable = this.sectionTable(doc, 'games', 'ContentSection__roundLabel');
    if (!gameTable) return games;

    const text = (el: Element | undefined) => el?.textContent?.trim() ?? '';
    const logo = (el: Element | undefined) => this.resolveImage(el?.querySelector('img')?.getAttribute('src'));
    let round = '';
    const rows = gameTable.getElementsByTagName('tr');
    // Überspringe die erste Header-Zeile
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].getElementsByTagName('td');

      // Zwischenüberschrift ("3. Spieltag", "Achtelfinale", …)
      if (cells.length === 0) {
        const heading = rows[i].querySelector('th[colspan]')?.textContent?.trim();
        if (heading) round = heading;
        continue;
      }
      if (cells.length < 6) continue;

      // Neue Struktur (8+ Spalten): Spiel, Beginn, Logo, Heim, Logo, Gast, Ort, Info/Erg., (Viertel)
      // Alte Struktur (6 Spalten):  idx, Beginn, Heim, Gast, Ort, Info/Erg.
      const modern = cells.length >= 8;
      const homeCell = cells[modern ? 3 : 2];
      const guestCell = cells[modern ? 5 : 3];
      const resultCell = cells[modern ? 7 : 5];

      let result = text(resultCell);
      if (result === 'mehr...') result = ' - ';

      const href = resultCell.querySelector('a')?.getAttribute('href') ?? '';
      const quarters = modern ? text(cells[8]) : '';

      games.push({
        start: text(cells[1]),
        home: text(homeCell),
        homeImageUrl: modern ? logo(cells[2]) : '',
        guest: text(guestCell),
        guestImageUrl: modern ? logo(cells[4]) : '',
        location: text(cells[modern ? 6 : 4]),
        gameLink: href.replace('https://dsvdaten.dsv.de/Modules/WB/', ''),
        result,
        number: text(cells[0]) || undefined,
        round: round || undefined,
        quarters: /\d/.test(quarters) ? quarters : undefined
      });
    }
    return games;
  }

  async getLocationLink(link: string): Promise<string> {
    const htmlResponse = await lastValueFrom(this.getItems(link));
    const parser = new DOMParser();
    const docGame: any = parser.parseFromString(htmlResponse, 'text/html');
    return docGame.getElementById('ContentSection__googleHyperLink')?.getAttribute('href') || '';
  }

  parseHtmlToTable(html: string): Table[] {
    const doc = this.toDoc(html);
    if (!doc) return [];
    return this.tableFromDoc(doc, this.logosFromGames(this.gamesFromDoc(doc)));
  }

  private tableFromDoc(doc: Document, logos: Map<string, string>): Table[] {
    const tables: Table[] = [];
    const tableTable = this.sectionTable(doc, 'table', 'ContentSection__tableLabel');
    if (!tableTable) return tables;

    const rows = tableTable.getElementsByTagName('tr');
    let lastPlace = 0;
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].getElementsByTagName('td');
      if (cells.length < 10) continue;

      // Spalten: Platz, Logo, Verein, Spiele, S, U, N, Tore, TD, Punkte
      const text = (n: number) => cells[n].textContent?.trim() ?? '';
      const teamText = text(2);
      const [team, ...infoParts] = teamText.split(' - ');
      const teamName = team.trim();

      // Logo: <img> in the cell (older pages) or the logo used in the fixtures.
      const imageUrl = this.resolveImage(cells[1].querySelector('img')?.getAttribute('src'))
        || logos.get(teamName) || '';

      // Tied teams without a head-to-head decision share a place: the DSV
      // leaves the place cell empty for all but the first of them.
      const place = parseInt(text(0));
      if (!isNaN(place)) lastPlace = place;

      tables.push({
        place: lastPlace || tables.length + 1,
        team: teamName,
        info: infoParts.length ? infoParts[0].trim() : '',
        imageUrl,
        games: parseInt(text(3).split('/')[0]), // "2/10" -> nimm erste Zahl
        wins: parseInt(text(4)),
        draws: parseInt(text(5)),
        losses: parseInt(text(6)),
        goals: text(7),
        goalDifference: parseInt(text(8).replace('+', '')), // "+53" -> 53
        points: parseInt(text(9))
      });
    }
    return tables;
  }

  parseHtmlToScorer(html: string): Scorer[] {
    const doc = this.toDoc(html);
    return doc ? this.scorersFromDoc(doc) : [];
  }

  private scorersFromDoc(doc: Document): Scorer[] {
    const scorers: Scorer[] = [];
    const scorer = this.sectionTable(doc, 'scorer', 'ContentSection__scorerLabel');
    if (!scorer) return scorers;

    const rows = scorer.getElementsByTagName('tr');
    let lastPlace = 0;
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].getElementsByTagName('td');
      if (cells.length < 5) continue;
      const text = (n: number) => cells[n].textContent?.trim() ?? '';

      const place = parseInt(text(0));
      if (!isNaN(place)) lastPlace = place;

      scorers.push({
        place: lastPlace,
        name: text(1),
        team: text(2),
        goals: parseInt(text(3)),
        games: parseInt(text(4))
      });
    }
    return scorers;
  }
}
