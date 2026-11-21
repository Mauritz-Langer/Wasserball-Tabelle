import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpClientModule } from '@angular/common/http';
import { of } from 'rxjs';

import { LigaService } from './liga.service';

describe('LigaService', () => {
    let service: LigaService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule]
        });
        service = TestBed.inject(LigaService);
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    describe('getLigaName', () => {
        it('parst den Liganamen korrekt', () => {
            const html = `
        <html><body>
          <div id="ContentSection__headerLabel"> Oberliga Nord </div>
        </body></html>`;
            const name = service.getLigaName(html);
            expect(name).toBe('Oberliga Nord');
        });

        it('gibt leeren String zurück, wenn Element fehlt', () => {
            const html = `<html><body><div>ohne id</div></body></html>`;
            const name = service.getLigaName(html);
            expect(name).toBe('');
        });
    });

    describe('parseHtmlToGames', () => {
        it('parst Spielzeilen inkl. Ergebnislink (neue League.aspx Struktur)', () => {
            const html = `
      <div class="card-header">
        <span id="ContentSection__roundLabel">Spielplan</span>
      </div>
      <div class="card-body">
        <table class="table table-sm table-hover">
          <tr>
            <th>Spiel</th><th>Beginn</th><th></th><th>Heim</th><th></th><th>Gast</th><th>Ort</th><th>Info / Erg.</th>
          </tr>
          <tr>
            <td>101</td>
            <td>04.10.25, 16:00 Uhr</td>
            <td></td>
            <td>Team A</td>
            <td></td>
            <td>Team B</td>
            <td>Berlin</td>
            <td><a href="https://dsvdaten.dsv.de/Modules/WB/Game.aspx?Season=2025&LeagueID=298&GameID=123">12:10</a></td>
          </tr>
          <tr>
            <td>102</td>
            <td>05.10.25, 17:00 Uhr</td>
            <td></td>
            <td>Team C</td>
            <td></td>
            <td>Team D</td>
            <td>Hamburg</td>
            <td>mehr...</td>
          </tr>
        </table>
      </div>`;

            const games = service.parseHtmlToGames(html);
            expect(games.length).toBe(2);

            expect(games[0]).toEqual(expect.objectContaining({
                start: '04.10.25, 16:00 Uhr',
                home: 'Team A',
                homeImageUrl: '',
                guest: 'Team B',
                guestImageUrl: '',
                location: 'Berlin',
                gameLink: 'Game.aspx?Season=2025&LeagueID=298&GameID=123',
                result: '12:10'
            }));

            expect(games[1]).toEqual(expect.objectContaining({
                start: '05.10.25, 17:00 Uhr',
                home: 'Team C',
                homeImageUrl: '',
                guest: 'Team D',
                guestImageUrl: '',
                location: 'Hamburg',
                gameLink: '',
                result: ' - '
            }));
        });

        it('parst Spielzeilen mit alter Struktur (id="games")', () => {
            const html = `
      <table id="games">
        <tr><th>h1</th></tr>
        <tr><th>h2</th></tr>
        <tr>
          <td>idx</td>
          <td>01.01.2025 12:00</td>
          <td>Team A</td>
          <td>Team B</td>
          <td>Berlin</td>
          <td><a href="https://dsvdaten.dsv.de/Modules/WB/GameDetails.aspx?id=123">12:10</a></td>
        </tr>
      </table>`;

            const games = service.parseHtmlToGames(html);
            expect(games.length).toBe(1);
            expect(games[0].home).toBe('Team A');
            expect(games[0].guest).toBe('Team B');
        });

        it('ignoriert Zeilen mit zu wenigen Spalten', () => {
            const html = `
      <div class="card-header">
        <span id="ContentSection__roundLabel">Spielplan</span>
      </div>
      <div class="card-body">
        <table class="table">
          <tr><th>h1</th></tr>
          <tr><td>nur 1</td></tr>
        </table>
      </div>`;
            const games = service.parseHtmlToGames(html);
            expect(games.length).toBe(0);
        });
    });

    describe('parseHtmlToTable', () => {
        it('parst Tabellenstände korrekt inkl. Team-Info (neue League.aspx Struktur)', () => {
            const html = `
      <div class="card-header">
        <span id="ContentSection__tableLabel">Tabelle</span>
      </div>
      <div class="card-body">
        <table class="table table-sm table-hover">
          <tr><th>Platz</th><th></th><th>Verein</th><th>Spiele</th><th>S*</th><th>U*</th><th>N*</th><th>Tore</th><th>TD*</th><th>Punkte</th></tr>
          <tr>
            <td>1</td>
            <td></td>
            <td>Team A - (i)</td>
            <td>10/20</td>
            <td>8</td>
            <td>1</td>
            <td>1</td>
            <td>120:80</td>
            <td>+40</td>
            <td>17</td>
          </tr>
          <tr>
            <td>2</td>
            <td></td>
            <td>Team B</td>
            <td>10/20</td>
            <td>7</td>
            <td>2</td>
            <td>1</td>
            <td>110:85</td>
            <td>+25</td>
            <td>15</td>
          </tr>
        </table>
      </div>`;

            const table = service.parseHtmlToTable(html);
            expect(table.length).toBe(2);

            expect(table[0]).toEqual({
                place: 1,
                team: 'Team A',
                info: '(i)',
                imageUrl: '',
                games: 10,
                wins: 8,
                draws: 1,
                losses: 1,
                goals: '120:80',
                goalDifference: 40,
                points: 17
            });

            expect(table[1]).toEqual({
                place: 2,
                team: 'Team B',
                info: '',
                imageUrl: '',
                games: 10,
                wins: 7,
                draws: 2,
                losses: 1,
                goals: '110:85',
                goalDifference: 25,
                points: 15
            });
        });

        it('parst Tabellenstände mit alter Struktur (id="table")', () => {
            const html = `
      <table id="table">
        <tr><th>Platz</th><th>Team</th></tr>
        <tr>
          <td>1</td>
          <td></td>
          <td>Team A</td>
          <td>10/20</td>
          <td>8</td>
          <td>1</td>
          <td>1</td>
          <td>120:80</td>
          <td>+40</td>
          <td>17</td>
        </tr>
      </table>`;

            const table = service.parseHtmlToTable(html);
            expect(table.length).toBe(1);
            expect(table[0].team).toBe('Team A');
        });

        it('gibt punktgleichen Teams ohne direkten Vergleich denselben Platz', () => {
            // DSV leaves the place cell empty (&nbsp;) for the second tied team.
            const row = (place: string, team: string) =>
              `<tr><td>${place}</td><td></td><td>${team}</td><td>0/3</td><td>0</td><td>0</td><td>0</td><td>0:0</td><td>0</td><td>0</td></tr>`;
            const html = `<table id="table"><tr><th>Platz</th></tr>${row('1', 'A')}${row('2', 'B')}${row('&nbsp;', 'C')}${row('4', 'D')}</table>`;
            expect(service.parseHtmlToTable(html).map(t => t.place)).toEqual([1, 2, 2, 4]);
        });
    });

    describe('parseHtmlToScorer', () => {
        it('parst Torschützenliste und übernimmt Platznummern über Gleichstände (neue League.aspx Struktur)', () => {
            const html = `
      <div class="card-header">
        <span id="ContentSection__scorerLabel">Torschützen</span>
      </div>
      <div class="card-body">
        <table class="table table-sm table-hover">
          <tr><th>Platz</th><th>Name</th><th>Team</th><th>Tore</th><th>Spiele</th></tr>
          <tr>
            <td>1</td>
            <td>Spieler A</td>
            <td>Team A</td>
            <td>20</td>
            <td>10</td>
          </tr>
          <tr>
            <td></td>
            <td>Spieler B</td>
            <td>Team B</td>
            <td>20</td>
            <td>11</td>
          </tr>
        </table>
      </div>`;

            const scorers = service.parseHtmlToScorer(html);
            expect(scorers.length).toBe(2);

            expect(scorers[0]).toEqual({
                place: 1,
                name: 'Spieler A',
                team: 'Team A',
                goals: 20,
                games: 10
            });
            expect(scorers[1]).toEqual({
                place: 1,
                name: 'Spieler B',
                team: 'Team B',
                goals: 20,
                games: 11
            });
        });

        it('parst Torschützenliste mit alter Struktur (id="scorer")', () => {
            const html = `
      <table id="scorer">
        <tr><th>Platz</th><th>Name</th><th>Team</th><th>Tore</th><th>Spiele</th></tr>
        <tr>
          <td>1</td>
          <td>Spieler A</td>
          <td>Team A</td>
          <td>20</td>
          <td>10</td>
        </tr>
      </table>`;

            const scorers = service.parseHtmlToScorer(html);
            expect(scorers.length).toBe(1);
            expect(scorers[0].name).toBe('Spieler A');
        });
    });

    describe('getLocationLink', () => {
        it('liefert die Google-Link-URL aus dem Spielbericht', async () => {
            const htmlPage = `
        <a id="ContentSection__googleHyperLink" href="https://maps.google.com/?q=Berlin">Map</a>
      `;
            vi.spyOn(service as any, 'getItems').mockReturnValue(of(htmlPage));
            const link = await service.getLocationLink('GameDetails.aspx?id=123');
            expect(link).toBe('https://maps.google.com/?q=Berlin');
        });

        it('gibt leeren String zurück, wenn kein Link vorhanden', async () => {
            vi.spyOn(service as any, 'getItems').mockReturnValue(of('<div>leer</div>'));
            const link = await service.getLocationLink('GameDetails.aspx?id=456');
            expect(link).toBe('');
        });
    });

    describe('parseLeague (aktuelle DSV-Struktur)', () => {
        const html = `
      <span id="ContentSection__headerLabel">Testliga männlich</span>
      <div class="tab-pane" id="games"><table>
        <tr><th>Spiel</th><th>Beginn</th><th></th><th>Heim</th><th></th><th>Gast</th><th>Ort</th><th colspan="2">Info / Erg.</th></tr>
        <tr><th colspan=7 align='center'><br/>1. Spieltag</th></tr>
        <tr><td>4</td><td><nobr>02.10.26</nobr>, 20:30 Uhr</td>
          <td><img src='LogoHandler.ashx?id=1'/></td><td>Alpha</td>
          <td><img src='LogoHandler.ashx?id=2'/></td><td>Beta</td><td>Bad</td>
          <td><a href="https://dsvdaten.dsv.de/Modules/WB/Game.aspx?Season=2026&LeagueID=9&Group=&LeagueKind=V&GameID=4">17:8</a></td>
          <td>(2:1, 4:3, 6:4, 5:0)</td></tr>
        <tr><th colspan=7 align='center'><br/>2. Spieltag</th></tr>
        <tr><td>5</td><td><nobr>09.10.26</nobr>, 18:00 Uhr</td>
          <td><img src='LogoHandler.ashx?id=2'/></td><td>Beta</td>
          <td><img src='LogoHandler.ashx?id=1'/></td><td>Alpha</td><td>Halle</td><td>mehr...</td><td></td></tr>
      </table></div>
      <div class="tab-pane" id="table"><table>
        <tr><th>Platz</th></tr>
        <tr><td>1</td><td><div><svg></svg></div></td><td>Alpha - Hinweis</td><td>1</td><td>1</td><td>0</td><td>0</td><td>17:8</td><td>+9</td><td>3</td></tr>
      </table></div>`;

        it('liest Runden, Viertelergebnisse und Logos aus den Spielzeilen', () => {
            const league = service.parseLeague(html);
            expect(league.name).toBe('Testliga männlich');
            expect(league.games.length).toBe(2);
            expect(league.games[0]).toEqual(expect.objectContaining({
                number: '4', round: '1. Spieltag', result: '17:8', quarters: '(2:1, 4:3, 6:4, 5:0)',
                homeImageUrl: '/api/Modules/WB/LogoHandler.ashx?id=1',
                gameLink: 'Game.aspx?Season=2026&LeagueID=9&Group=&LeagueKind=V&GameID=4'
            }));
            expect(league.games[1]).toEqual(expect.objectContaining({ round: '2. Spieltag', result: ' - ', quarters: undefined }));
        });

        it('übernimmt das Logo für die Tabelle aus dem Spielplan (Tabelle enthält nur Inline-SVG)', () => {
            const league = service.parseLeague(html);
            expect(league.table[0]).toEqual(expect.objectContaining({
                team: 'Alpha', info: 'Hinweis', goalDifference: 9, points: 3,
                imageUrl: '/api/Modules/WB/LogoHandler.ashx?id=1'
            }));
        });

        it('merkt sich geladene Ligen für sofortige Anzeige (peek)', () => {
            const link = 'League.aspx?Season=2026&LeagueID=9';
            vi.spyOn(service, 'getItems').mockReturnValue(of(html));
            expect(service.peek(link)).toBeNull();
            service.fetchLeagueData(link).subscribe();
            expect(service.peek(link)?.games.length).toBe(2);
            service.fetchLeagueData(link).subscribe();
            expect(service.getItems).toHaveBeenCalledTimes(1); // innerhalb der Cache-Zeit kein zweiter Abruf
        });
    });
});
