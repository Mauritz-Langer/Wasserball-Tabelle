import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatTab, MatTabGroup } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
import { GameDetailsService } from '../../services/game-details/game-details.service';
import { GameDetails, GameEvent } from '../../models/game-details';

@Component({
    selector: 'app-game-details',
    imports: [
        CommonModule,
        MatCard,
        MatCardContent,
        MatCardHeader,
        MatCardTitle,
        MatProgressSpinner,
        MatIcon,
        MatButton,
        MatIconButton,
        MatTabGroup,
        MatTab,
        MatExpansionModule
    ],
    templateUrl: './game-details.component.html',
    styleUrl: './game-details.component.scss'
})
export class GameDetailsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private gameDetailsService = inject(GameDetailsService);


  gameDetails: GameDetails | null = null;
  isLoading = true;
  error: string | null = null;

  // Timeline state für Mobile
  activeEventIndex: number | null = null;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const param = params['param'];
      if (param) {
        this.loadGameDetails(param);
      } else {
        this.error = 'Keine Spiel-ID angegeben';
        this.isLoading = false;
      }
    });
  }

  /**
   * Lädt die Spieldetails
   */
  private loadGameDetails(link: string): void {
    this.isLoading = true;
    this.error = null;

    this.gameDetailsService.getGameData(link).subscribe({
      next: (html: string) => {
        try {
          this.gameDetails = this.gameDetailsService.parseHtmlToGameDetails(html);
          this.isLoading = false;
        } catch (error) {
          console.error('Error parsing game details:', error);
          this.error = 'Fehler beim Laden der Spieldetails';
          this.isLoading = false;
        }
      },
      error: (error) => {
        console.error('Error loading game details:', error);
        this.error = 'Fehler beim Laden der Spieldetails';
        this.isLoading = false;
      }
    });
  }

  /**
   * Navigiert zurück zur vorherigen Seite (Liga)
   */
  goBack(): void {
    // Hole den ligaParam aus den Query-Parametern
    const ligaParam = this.route.snapshot.queryParams['ligaParam'];

    if (ligaParam) {
      // Navigiere zurück zur Liga mit dem ursprünglichen Parameter
      this.router.navigate(['/liga'], {
        queryParams: { param: ligaParam }
      });
    } else {
      // Fallback: Navigiere zur Übersicht, falls kein ligaParam vorhanden
      this.router.navigate(['/']);
    }
  }

  /**
   * Öffnet Google Maps mit dem Spielort
   */
  openGoogleMaps(): void {
    if (this.gameDetails?.venue.googleMapsLink) {
      window.open(this.gameDetails.venue.googleMapsLink, '_blank');
    }
  }

  /**
   * Öffnet den Video-Link
   */
  openVideoLink(): void {
    if (this.gameDetails?.videoLink) {
      window.open(this.gameDetails.videoLink, '_blank');
    }
  }

  /**
   * Lädt das Protokoll herunter
   */
  downloadProtocol(): void {
    if (this.gameDetails?.protocolLink) {
      window.open(this.gameDetails.protocolLink, '_blank');
    }
  }

  /**
   * Hilfsfunktion: Prüft ob Officials-Daten vorhanden sind
   */
  hasOfficials(): boolean {
    if (!this.gameDetails?.officials) return false;
    const officials = this.gameDetails.officials;
    return !!(officials.referee1 || officials.referee2 || officials.timekeeper1 ||
              officials.timekeeper2 || officials.secretary1 || officials.secretary2);
  }

  /**
   * Hilfsfunktion: Konvertiert Event-Type-Kürzel in verständlichen Text
   */
  getEventTypeName(eventType: string): string {
    const typeMap: { [key: string]: string } = {
      'T': 'Tor',
      'A': 'Ausschluss',
      'AU': 'Auszeit',
      'AmE': 'Ausschluss mit Ersatz',
      'P': 'Penalty',
      'S': 'Strafe',
      'TO': 'Timeout',
      'E': 'Einwechslung',
      'X': 'Pause',
      '5m': '5m-Wurf',
      'Penalty': 'Penalty',
      'Goal': 'Tor',
      'Exclusion': 'Ausschluss',
      'Timeout': 'Timeout'
    };

    return typeMap[eventType] || eventType;
  }

  /**
   * Hilfsfunktion: Gibt Icon für Event-Typ zurück
   */
  getEventIcon(eventType: string): string {
    const iconMap: { [key: string]: string } = {
      'T': 'sports_soccer',
      'A': 'person_off',
      'AU': 'pause',
      'AmE': 'person_off',
      'P': 'flag',
      'S': 'warning',
      'TO': 'timer',
      'E': 'swap_horiz',
      'X': 'pause',
      '5m': 'sports_handball',
      'Goal': 'sports_soccer',
      'Penalty': 'flag',
      'Exclusion': 'person_off',
      'Timeout': 'timer'
    };

    return iconMap[eventType] || 'info';
  }

  /**
   * Hilfsfunktion: Gibt das Foul-Zeichen für ein bestimmtes Viertel zurück
   */
  getFoulForQuarter(fouls: any[], quarter: number): string {
    const foul = fouls.find(f => f.quarter === quarter);
    return foul ? foul.foulType : '';
  }

  /**
   * Hilfsfunktion: Berechnet die Gesamtanzahl der Tore eines Teams
   */
  getTotalGoals(players: any[]): number {
    return players.reduce((sum, player) => sum + (player.goals || 0), 0);
  }

  /**
   * Hilfsfunktion: Findet den Top-Scorer eines Teams
   */
  getTopScorer(players: any[]): any {
    return players.reduce((max, player) =>
      (player.goals > (max?.goals || 0)) ? player : max, null
    );
  }

  /**
   * Hilfsfunktion: Berechnet die Gesamtanzahl der Fouls eines Teams
   */
  getTotalFouls(players: any[]): number {
    return players.reduce((sum, player) => sum + (player.fouls?.length || 0), 0);
  }

  /**
   * Hilfsfunktion: Prüft ob ein Spieler der Top-Scorer ist
   */
  isTopScorer(player: any, players: any[]): boolean {
    const topScorer = this.getTopScorer(players);
    return topScorer && player.goals > 0 && player.goals === topScorer.goals;
  }

  /**
   * Hilfsfunktion: Filtert Events nach Viertel
   */
  getEventsByQuarter(events: any[], quarter: number): any[] {
    return events.filter(event => event.period === quarter);
  }

  /**
   * Hilfsfunktion: Gibt Quarter-Score für spezifisches Viertel zurück
   */
  getQuarterScoreByNumber(quarter: number): any {
    return this.gameDetails?.quarterScores.find(q => q.quarter === quarter);
  }

  /**
   * Hilfsfunktion: Extrahiert Heim-Team Endergebnis
   */
  getFinalHomeScore(): string {
    if (!this.gameDetails?.finalScore) return '0';
    const scores = this.gameDetails.finalScore.split(':');
    return scores[0]?.trim() || '0';
  }

  /**
   * Hilfsfunktion: Extrahiert Gast-Team Endergebnis
   */
  getFinalGuestScore(): string {
    if (!this.gameDetails?.finalScore) return '0';
    const scores = this.gameDetails.finalScore.split(':');
    return scores[1]?.trim() || '0';
  }

  /**
   * Hilfsfunktion: Prüft ob Team-Details vorhanden sind
   */
  hasTeamDetails(): boolean {
    if (!this.gameDetails) return false;
    const home = this.gameDetails.homeTeam;
    const guest = this.gameDetails.guestTeam;
    return !!(home.coach || home.captain || home.teamLeader || home.assistant || home.bestPlayer ||
              guest.coach || guest.captain || guest.teamLeader || guest.assistant || guest.bestPlayer);
  }

  /**
   * Hilfsfunktion: Prüft ob Spielerstatistiken vorhanden sind
   */
  hasPlayerStats(): boolean {
    if (!this.gameDetails) return false;
    const homePlayers = this.gameDetails.homeTeam?.players;
    const guestPlayers = this.gameDetails.guestTeam?.players;
    return !!((homePlayers && homePlayers.length > 0) || (guestPlayers && guestPlayers.length > 0));
  }

  /**
   * Hilfsfunktion: Prüft ob Spielverlauf-Events vorhanden sind
   */
  hasGameEvents(): boolean {
    return !!(this.gameDetails?.events && this.gameDetails.events.length > 0);
  }

  /**
   * Hilfsfunktion: Prüft ob Statistiken vorhanden sind
   */
  hasStatistics(): boolean {
    return !!this.gameDetails?.statistics;
  }

  /**
   * Hilfsfunktion: Prüft ob das Spiel beendet ist
   */
  isGameFinished(): boolean {
    if (!this.gameDetails) return false;

    // 1. Prüfe ob ein gültiges Ergebnis vorliegt (nicht "0:0" oder leer)
    const finalScore = this.gameDetails.finalScore;
    if (finalScore && finalScore !== '0:0' && finalScore !== ':' && finalScore.includes(':')) {
      const scores = finalScore.split(':');
      const homeScore = parseInt(scores[0]?.trim() || '0');
      const guestScore = parseInt(scores[1]?.trim() || '0');
      // Wenn mindestens ein Team Tore hat, ist das Spiel gespielt
      if (homeScore > 0 || guestScore > 0) {
        return true;
      }
    }

    // 2. Prüfe ob Spielverlauf-Events vorhanden sind (bedeutet Spiel wurde gespielt)
    if (this.gameDetails.events && this.gameDetails.events.length > 0) {
      return true;
    }

    // 3. Prüfe ob das Datum in der Vergangenheit liegt
    if (this.gameDetails.startDate) {
      try {
        // Deutsches Datumsformat parsen: "DD.MM.YYYY, HH:MM Uhr" oder "DD.MM.YY, HH:MM Uhr"
        const dateStr = this.gameDetails.startDate;
        const parts = dateStr.replace(' Uhr', '').split(', ');

        if (parts.length >= 1) {
          const datePart = parts[0].trim();
          const timePart = parts[1]?.trim() || '00:00';

          const dateParts = datePart.split('.');
          const timeParts = timePart.split(':');

          if (dateParts.length >= 3 && timeParts.length >= 2) {
            const day = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1; // Monate sind 0-basiert
            let year = parseInt(dateParts[2]);

            // Wenn Jahr 2-stellig ist (z.B. 24), zu 4-stellig konvertieren
            if (year < 100) {
              year += 2000;
            }

            const hours = parseInt(timeParts[0]);
            const minutes = parseInt(timeParts[1]);

            const gameDate = new Date(year, month, day, hours, minutes);
            const now = new Date();

            // Spiel ist beendet, wenn es mehr als 2 Stunden in der Vergangenheit liegt
            // (um laufende Spiele zu berücksichtigen)
            const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));
            return gameDate < twoHoursAgo;
          }
        }
      } catch (error) {
        console.error('Error parsing game date:', error);
      }
    }

    // Wenn nichts davon zutrifft, gilt das Spiel als noch nicht beendet
    return false;
  }

  /**
   * Berechnet die Position eines Events auf der Timeline (0-100%)
   * @param event Das GameEvent
   * @returns Position in Prozent (0-100)
   */
  getEventTimelinePosition(event: GameEvent): number {
    // Parse die Spielminute aus dem time-String
    const minute = this.parseGameMinute(event.time, event.period);
    if (minute === null) return 0;

    // Wasserball: 4 Viertel à 8 Minuten = 32 Minuten gesamt
    const totalGameMinutes = 32;
    const position = (minute / totalGameMinutes) * 100;

    // Begrenze auf 0-100%
    return Math.max(0, Math.min(100, position));
  }

  /**
   * Parst die Spielminute aus dem time-String
   * @param time Zeit-String (z.B. "5:23" oder "12:34")
   * @param period Viertel (1-4)
   * @returns Absolute Spielminute oder null
   */
  parseGameMinute(time: string, period: number): number | null {
    try {
      // Zeit-Format: "M:SS" (z.B. "5:23" für 5 Minuten 23 Sekunden im Viertel)
      const parts = time.split(':');
      if (parts.length !== 2) return null;

      const minutes = parseInt(parts[0]);
      const seconds = parseInt(parts[1]);

      if (isNaN(minutes) || isNaN(seconds)) return null;

      // Berechne absolute Spielminute
      // Jedes Viertel hat 8 Minuten
      const quarterStartMinute = (period - 1) * 8;
      const minuteInQuarter = minutes + (seconds / 60);

      return quarterStartMinute + minuteInQuarter;
    } catch {
      return null;
    }
  }

  /**
   * Gruppiert Events nach Viertel für die Timeline
   */
  getEventsByPeriod(period: number): GameEvent[] {
    if (!this.gameDetails?.events) return [];
    return this.gameDetails.events.filter(e => e.period === period);
  }

  /**
   * Gibt alle Events sortiert nach Zeit zurück
   */
  getAllEventsSorted(): GameEvent[] {
    if (!this.gameDetails?.events) return [];
    return [...this.gameDetails.events].sort((a, b) => {
      const minuteA = this.parseGameMinute(a.time, a.period) || 0;
      const minuteB = this.parseGameMinute(b.time, b.period) || 0;
      return minuteA - minuteB;
    });
  }

  /**
   * Teilt den User via Web Share API
   */
  shareGame(): void {
    if (!this.gameDetails) return;

    const shareData = {
      title: `Wasserball: ${this.gameDetails.homeTeam.name} vs ${this.gameDetails.guestTeam.name}`,
      text: `Endergebnis: ${this.getFinalHomeScore()}:${this.getFinalGuestScore()}\n${this.gameDetails.league}`,
      url: window.location.href
    };

    // Prüfe ob Web Share API verfügbar ist
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      navigator.share(shareData)
        .then(() => console.log('Erfolgreich geteilt'))
        .catch((error) => console.log('Fehler beim Teilen:', error));
    } else {
      // Fallback: Kopiere Link in Zwischenablage
      this.copyToClipboard(window.location.href);
    }
  }

  /**
   * Kopiert Text in die Zwischenablage
   */
  private copyToClipboard(text: string): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          alert('Link in Zwischenablage kopiert!');
        })
        .catch((error) => {
          console.error('Fehler beim Kopieren:', error);
          this.fallbackCopyToClipboard(text);
        });
    } else {
      this.fallbackCopyToClipboard(text);
    }
  }

  /**
   * Fallback für ältere Browser
   */
  private fallbackCopyToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      alert('Link in Zwischenablage kopiert!');
    } catch (error) {
      console.error('Fallback-Kopieren fehlgeschlagen:', error);
      alert('Link konnte nicht kopiert werden. Bitte manuell kopieren: ' + text);
    }
    document.body.removeChild(textArea);
  }

  /**
   * Toggle Event-Popup für Mobile (Touch)
   * @param index Index des Events in der sortierten Liste
   * @param event Click/Touch Event
   */
  toggleEventPopup(index: number, event: Event): void {
    event.stopPropagation();

    // Toggle: Wenn bereits aktiv, deaktivieren
    if (this.activeEventIndex === index) {
      this.activeEventIndex = null;
    } else {
      this.activeEventIndex = index;
    }
  }

  /**
   * Prüft ob ein Event aktiv (geöffnet) ist
   * @param index Index des Events
   */
  isEventActive(index: number): boolean {
    return this.activeEventIndex === index;
  }

  /**
   * Schließt alle Event-Popups (z.B. bei Tap außerhalb)
   */
  closeAllEventPopups(): void {
    this.activeEventIndex = null;
  }

  /**
   * Berechnet Popup-Position-Klasse für Events am Rand
   * @param position Position in Prozent (0-100)
   */
  getPopupPositionClass(position: number): string {
    if (position < 20) return 'popup-right';
    if (position > 80) return 'popup-left';
    return '';
  }
}
