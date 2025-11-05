import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiProxyService } from '../api-proxy/api-proxy.service';
import {
  GameDetails,
  GameEvent,
  Officials,
  QuarterScore,
  TeamDetails,
  Venue,
  GameStatistics,
  TeamStatistics,
  PlayerStatistics,
  PersonalFoul
} from '../../models/game-details';

@Injectable({
  providedIn: 'root'
})
export class GameDetailsService {

  constructor(private http: HttpClient, private apiProxy: ApiProxyService) { }

  /**
   * Lädt die HTML-Daten für ein spezifisches Spiel
   */
  getGameData(link: string): Observable<string> {
    const url = this.apiProxy.getApiUrl('/Modules/WB/' + link);
    return this.http.get(url, { responseType: 'text' });
  }

  /**
   * Parst HTML zu GameDetails-Objekt
   */
  parseHtmlToGameDetails(html: string): GameDetails {
    // Bereinige HTML
    html = html.replace(/<nobr>/g, '')
      .replace(/<\/nobr>/g, '')
      .replace(/target=_blank/g, '');

    let doc: any;
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(html, 'text/html');
    } catch (error) {
      console.error('Error parsing HTML:', error);
      throw error;
    }

    // Extrahiere alle Daten
    const gameId = this.getTextContent(doc, 'ContentSection__gameidLabel');
    const league = this.getTextContent(doc, 'ContentSection__leagueLabel');
    const startDate = this.getTextContent(doc, 'ContentSection__startdateLabel');
    const playKind = this.getTextContent(doc, 'ContentSection__playkindLabel');

    // Extrahiere Logos aus dem Header-Element
    const { homeLogoUrl, guestLogoUrl } = this.extractLogosFromHeader(doc);

    const homeTeam = this.parseTeamDetails(doc, 'white', homeLogoUrl);
    const guestTeam = this.parseTeamDetails(doc, 'blue', guestLogoUrl);

    const finalScore = this.getTextContent(doc, 'ContentSection__scoringLabel');
    const quarterScores = this.parseQuarterScores(doc);

    const venue = this.parseVenue(doc);
    const officials = this.parseOfficials(doc);
    const events = this.parseGameEvents(doc);
    const statistics = this.parseStatistics(doc);

    const notes = this.getTextContent(doc, 'ContentSection__noteLabel');
    const videoLink = this.getAttribute(doc, 'ContentSection__videolinkHyperLink', 'href');
    const protocolLink = this.getAttribute(doc, 'ContentSection__protocolLinkButton', 'href');
    const endGameTime = this.getTextContent(doc, 'ContentSection__endgameLabel');
    const organizer = this.getTextContent(doc, 'ContentSection__organizerLabel');

    return {
      gameId,
      league,
      startDate,
      playKind,
      homeTeam,
      guestTeam,
      finalScore,
      quarterScores,
      venue,
      officials,
      events,
      statistics: statistics || undefined,
      notes: notes || undefined,
      videoLink: videoLink || undefined,
      protocolLink: protocolLink || undefined,
      endGameTime: endGameTime || undefined,
      organizer: organizer || undefined
    };
  }

  /**
   * Hilfsfunktion: Extrahiert Textinhalt eines Elements
   */
  private getTextContent(doc: any, id: string): string {
    return doc.getElementById(id)?.textContent?.trim() || '';
  }

  /**
   * Hilfsfunktion: Extrahiert Attribut eines Elements
   */
  private getAttribute(doc: any, id: string, attribute: string): string | null {
    return doc.getElementById(id)?.getAttribute(attribute) || null;
  }

  /**
   * Extrahiert die Logos aus dem Header-Element
   * Format: <span id="ContentSection__headerLabel"><img src="..."/>Team1 : <img src="..."/>Team2</span>
   */
  private extractLogosFromHeader(doc: any): { homeLogoUrl: string, guestLogoUrl: string } {
    let homeLogoUrl = '';
    let guestLogoUrl = '';

    const headerElement = doc.getElementById('ContentSection__headerLabel');
    if (headerElement) {
      const images = headerElement.querySelectorAll('img');

      // Erstes Bild = Heim-Team, Zweites Bild = Gast-Team
      if (images.length >= 1) {
        const homeSrc = images[0].getAttribute('src');
        if (homeSrc) {
          if (homeSrc.startsWith('data:')) {
            homeLogoUrl = homeSrc;
          } else if (homeSrc.startsWith('http')) {
            homeLogoUrl = homeSrc;
          } else {
            homeLogoUrl = 'https://dsvdaten.dsv.de' + (homeSrc.startsWith('/') ? '' : '/') + homeSrc;
          }
        }
      }

      if (images.length >= 2) {
        const guestSrc = images[1].getAttribute('src');
        if (guestSrc) {
          if (guestSrc.startsWith('data:')) {
            guestLogoUrl = guestSrc;
          } else if (guestSrc.startsWith('http')) {
            guestLogoUrl = guestSrc;
          } else {
            guestLogoUrl = 'https://dsvdaten.dsv.de' + (guestSrc.startsWith('/') ? '' : '/') + guestSrc;
          }
        }
      }
    }

    return { homeLogoUrl, guestLogoUrl };
  }

  /**
   * Parst Team-Details (Heim oder Gast)
   */
  private parseTeamDetails(doc: any, prefix: string, logoUrl: string): TeamDetails {
    const name = this.getTextContent(doc, `ContentSection__${prefix}Label`);
    const players = this.parsePlayerStatistics(doc, prefix);

    return {
      name,
      logoUrl,
      coach: this.getTextContent(doc, `ContentSection__${prefix}coachLabel`) || undefined,
      captain: this.getTextContent(doc, `ContentSection__${prefix}captainLabel`) || undefined,
      teamLeader: this.getTextContent(doc, `ContentSection__${prefix}leiterLabel`) || undefined,
      assistant: this.getTextContent(doc, `ContentSection__${prefix}betreuerLabel`) || undefined,
      bestPlayer: this.getTextContent(doc, `ContentSection__${prefix}bestLabel`) || undefined,
      players: players.length > 0 ? players : undefined
    };
  }

  /**
   * Parst Spielerstatistiken für ein Team aus der Tabelle im "players" Tab
   * Die Tabelle ist im div#players > div.container-fluid > div.row strukturiert
   * - Erstes div.col-12.col-md-6 = Heim-Team (white)
   * - Zweites div.col-12.col-md-6 = Gast-Team (blue)
   */
  private parsePlayerStatistics(doc: any, prefix: string): PlayerStatistics[] {
    const players: PlayerStatistics[] = [];

    try {
      // Finde den players Tab
      const playersTab = doc.getElementById('players');
      if (!playersTab) {
        return players;
      }

      // Finde alle col-12 col-md-6 divs (Team-Container)
      const teamContainers = playersTab.querySelectorAll('.col-12.col-md-6');

      // white = erstes Team (Index 0), blue = zweites Team (Index 1)
      const teamIndex = prefix === 'white' ? 0 : 1;

      if (teamContainers.length <= teamIndex) {
        return players;
      }

      const teamContainer = teamContainers[teamIndex];
      const table = teamContainer.querySelector('table');

      if (!table) {
        return players;
      }

      // Finde alle Zeilen in der Tabelle
      const rows = table.querySelectorAll('tr');

      // Iteriere über Zeilen (überspringe die ersten 2 Header-Zeilen)
      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');

        // Zeile mit colspan ist Team-Info, keine Spieler-Zeile
        if (cells.length < 8) {
          continue;
        }

        // Extrahiere Spieler-Daten
        const number = cells[0]?.textContent?.trim() || '';
        const name = cells[1]?.textContent?.trim() || '';
        const birthYear = cells[2]?.textContent?.trim() || '';
        const goalsText = cells[3]?.textContent?.trim() || '';

        // Parse Tore (kann leer sein = 0 Tore)
        const goals = goalsText && goalsText !== '\u00A0' && goalsText !== ''
          ? parseInt(goalsText)
          : 0;

        // Parse persönliche Fehler (Viertel 1-4)
        const fouls: PersonalFoul[] = [];
        for (let quarter = 1; quarter <= 4; quarter++) {
          const foulText = cells[3 + quarter]?.textContent?.trim() || '';
          const foulType = foulText && foulText !== '\u00A0' && foulText !== ''
            ? foulText
            : '';

          if (foulType) {
            fouls.push({
              quarter,
              foulType
            });
          }
        }

        // Füge Spieler hinzu (auch wenn 0 Tore und keine Fouls)
        players.push({
          number,
          name,
          birthYear,
          goals: isNaN(goals) ? 0 : goals,
          fouls
        });
      }
    } catch (error) {
      console.error('Error parsing player statistics:', error);
    }

    return players;
  }

  /**
   * Parst Viertel-Ergebnisse aus der Scoreboard-Tabelle
   */
  private parseQuarterScores(doc: any): QuarterScore[] {
    const quarterScores: QuarterScore[] = [];
    const scoreboard = doc.getElementById('ContentSection_scoreboard');

    if (scoreboard) {
      const rows = scoreboard.querySelectorAll('tr');
      if (rows.length >= 3) {
        // Zeile 0: Header
        // Zeile 1: Heim-Team
        // Zeile 2: Gast-Team
        const homeCells = rows[1].querySelectorAll('td');
        const guestCells = rows[2].querySelectorAll('td');

        // Die Zellen enthalten: Team-Name, Q1, Q2, Q3, Q4, (evtl. Verl.), Gesamt
        // Wir nehmen Zellen 1-4 für die Viertel
        for (let i = 1; i <= 4 && i < homeCells.length - 1; i++) {
          const homeText = homeCells[i]?.textContent?.trim() || '0';
          const guestText = guestCells[i]?.textContent?.trim() || '0';

          // Parse nur wenn es Zahlen sind
          const homeScore = parseInt(homeText);
          const guestScore = parseInt(guestText);

          // Füge nur hinzu wenn beides valide Zahlen sind
          if (!isNaN(homeScore) && !isNaN(guestScore)) {
            quarterScores.push({
              quarter: i,
              home: homeScore,
              guest: guestScore
            });
          }
        }
      }
    }

    // Fallback: Wenn Scoreboard nicht gefunden, versuche aus Spiel-Ergebnis zu extrahieren
    if (quarterScores.length === 0) {
      // Suche nach Pattern wie "(8:1, 8:0, 4:0, 7:4)"
      const resultText = this.getTextContent(doc, 'ContentSection__scoringLabel');
      const quarterPattern = /\((\d+):(\d+),\s*(\d+):(\d+),\s*(\d+):(\d+),\s*(\d+):(\d+)\)/;
      const match = resultText.match(quarterPattern);

      if (match) {
        for (let i = 0; i < 4; i++) {
          quarterScores.push({
            quarter: i + 1,
            home: parseInt(match[i * 2 + 1]),
            guest: parseInt(match[i * 2 + 2])
          });
        }
      }
    }

    return quarterScores;
  }

  /**
   * Parst Spielort-Informationen
   */
  private parseVenue(doc: any): Venue {
    return {
      poolName: this.getTextContent(doc, 'ContentSection__poolnameLabel'),
      poolCity: this.getTextContent(doc, 'ContentSection__poolcityLabel'),
      googleMapsLink: this.getAttribute(doc, 'ContentSection__googleHyperLink', 'href') || ''
    };
  }

  /**
   * Parst Offizielle (Schiedsrichter, Zeitnehmer, etc.)
   */
  private parseOfficials(doc: any): Officials {
    return {
      referee1: this.getTextContent(doc, 'ContentSection__schiedsrichter1Label') || undefined,
      referee2: this.getTextContent(doc, 'ContentSection__schiedsrichter2Label') || undefined,
      timekeeper1: this.getTextContent(doc, 'ContentSection__zeitnehmer1Label') || undefined,
      timekeeper2: this.getTextContent(doc, 'ContentSection__zeitnehmer2Label') || undefined,
      secretary1: this.getTextContent(doc, 'ContentSection__sekretaer1Label') || undefined,
      secretary2: this.getTextContent(doc, 'ContentSection__sekretaer2Label') || undefined,
      goalJudge1: this.getTextContent(doc, 'ContentSection__torrichter1Label') || undefined,
      goalJudge2: this.getTextContent(doc, 'ContentSection__torrichter2Label') || undefined,
      observer1: this.getTextContent(doc, 'ContentSection__observer1Label') || undefined,
      observer2: this.getTextContent(doc, 'ContentSection__observer2Label') || undefined
    };
  }

  /**
   * Parst Spielverlauf (Events)
   */
  private parseGameEvents(doc: any): GameEvent[] {
    const events: GameEvent[] = [];
    let lastHomeScore = 0;
    let lastGuestScore = 0;

    // gameRepeater kann bis zu 100 Einträge haben (erweitert für größere Spiele)
    for (let i = 0; i < 100; i++) {
      const time = this.getTextContent(doc, `ContentSection__gameRepeater__timeLabel_${i}`);

      // Wenn kein time-Element existiert, sind wir am Ende
      if (!time) break;

      const period = this.getTextContent(doc, `ContentSection__gameRepeater__periodLabel_${i}`);
      const player = this.getTextContent(doc, `ContentSection__gameRepeater__playerLabel_${i}`);
      const eventType = this.getTextContent(doc, `ContentSection__gameRepeater__eventkeyLabel_${i}`);

      // WICHTIG: Das "goals"-Feld enthält den aktuellen Spielstand im Format "X:Y"
      // Die "home" und "guest" Felder enthalten die Trikotnummer des Spielers!
      const goalsText = this.getTextContent(doc, `ContentSection__gameRepeater__goalsLabel_${i}`);

      // Parse Spielstand aus goals-Feld (Format: "12:5" oder leer)
      let homeScore = lastHomeScore;
      let guestScore = lastGuestScore;
      let goalNumber: number | undefined = undefined;

      if (goalsText) {
        const scoreMatch = goalsText.match(/(\d+):(\d+)/);
        if (scoreMatch) {
          homeScore = parseInt(scoreMatch[1]);
          guestScore = parseInt(scoreMatch[2]);

          // Aktualisiere letzten bekannten Stand
          lastHomeScore = homeScore;
          lastGuestScore = guestScore;

          // Bei Tor-Events ist goalNumber die Summe der Tore
          if (eventType === 'T' || eventType === 'Tor' || eventType === 'Goal') {
            goalNumber = homeScore + guestScore;
          }
        }
      }
      // Wenn goals-Feld leer ist (bei Ausschlüssen, Strafen, etc.),
      // verwenden wir den letzten bekannten Spielstand

      events.push({
        time,
        period: parseInt(period || '0'),
        homeScore,
        guestScore,
        player: player || '',
        eventType: eventType || '',
        goalNumber
      });
    }

    return events;
  }

  /**
   * Parst Statistiken (falls vorhanden)
   */
  private parseStatistics(doc: any): GameStatistics | null {
    const homeStatsLabel = this.getTextContent(doc, 'ContentSection__stats_homeLabel');
    const guestStatsLabel = this.getTextContent(doc, 'ContentSection__stats_guestLabel');

    // Wenn keine Labels vorhanden, gibt es keine Statistiken
    if (!homeStatsLabel && !guestStatsLabel) {
      return null;
    }

    const homeStats = this.parseTeamStatistics(doc, 'ContentSection_stats_home', homeStatsLabel);
    const guestStats = this.parseTeamStatistics(doc, 'ContentSection_stats_guest', guestStatsLabel);

    return {
      home: homeStats,
      guest: guestStats
    };
  }

  /**
   * Parst Team-Statistiken aus Tabelle
   */
  private parseTeamStatistics(doc: any, tableId: string, label: string): TeamStatistics {
    const data: { [key: string]: string } = {};
    const table = doc.getElementById(tableId);

    if (table) {
      const rows = table.querySelectorAll('tr');
      rows.forEach((row: any) => {
        const cells = row.querySelectorAll('th, td');
        if (cells.length >= 2) {
          const key = cells[0]?.textContent?.trim() || '';
          const value = cells[1]?.textContent?.trim() || '';
          if (key && value) {
            data[key] = value;
          }
        }
      });
    }

    return {
      label,
      data
    };
  }
}

