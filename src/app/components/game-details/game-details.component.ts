import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatTab, MatTabGroup } from '@angular/material/tabs';
import { GameDetailsService } from '../../services/game-details/game-details.service';
import { GameDetails } from '../../models/game-details';

@Component({
  selector: 'app-game-details',
  standalone: true,
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
    MatTab
  ],
  templateUrl: './game-details.component.html',
  styleUrl: './game-details.component.scss'
})
export class GameDetailsComponent implements OnInit {

  gameDetails: GameDetails | null = null;
  isLoading = true;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private gameDetailsService: GameDetailsService
  ) {}

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
   * Navigiert zurück zur vorherigen Seite
   */
  goBack(): void {
    this.router.navigate(['/liga'], {
      queryParams: this.route.snapshot.queryParams
    });
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
      'P': 'Penalty',
      'S': 'Strafe',
      'TO': 'Timeout',
      'E': 'Einwechslung',
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
      'P': 'flag',
      'S': 'warning',
      'TO': 'timer',
      'E': 'swap_horiz',
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
}

