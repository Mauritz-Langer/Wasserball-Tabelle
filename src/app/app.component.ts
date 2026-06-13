import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { MatToolbar } from "@angular/material/toolbar";
import { MatIcon } from "@angular/material/icon";
import { MatIconButton, MatButton } from "@angular/material/button";
import { MatProgressBar } from "@angular/material/progress-bar";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltip } from "@angular/material/tooltip";
import { trigger, transition, style, animate } from "@angular/animations";
import { filter } from "rxjs";
import { FavoritesService } from "./services/favorites/favorites.service";
import { ThemeService } from "./services/theme/theme.service";
import { SeasonService } from "./services/season/season.service";
import { DatabaseService } from "./services/database/database.service";
import { ConsentService } from "./services/consent/consent.service";
import { TrackingService } from "./services/tracking/tracking.service";

@Component({
    selector: 'app-root',
    imports: [
        MatToolbar,
        RouterOutlet,
        RouterLink,
        RouterLinkActive,
        MatIcon,
        MatIconButton,
        MatButton,
        MatTooltip,
        MatProgressBar,
        MatMenuModule
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    animations: [
        trigger('routeFade', [
            transition('* => *', [
                style({ opacity: 0 }),
                animate('160ms ease-out', style({ opacity: 1 }))
            ])
        ])
    ]
})
export class AppComponent implements OnInit {
  private router = inject(Router);
  private favoritesService = inject(FavoritesService);
  themeService = inject(ThemeService);
  seasonService = inject(SeasonService);
  databaseService = inject(DatabaseService);
  consentService = inject(ConsentService);
  private tracking = inject(TrackingService);

  isHomePage = true;
  favoritesCount = 0;
  /** Key that changes on every navigation to drive the route fade. */
  routeKey = '';

  constructor() {
    // GDPR: only initialise tracking after the user has explicitly consented.
    if (this.consentService.hasConsent) {
      this.tracking.init();
    }
  }

  acceptConsent(): void {
    this.consentService.accept();
    this.tracking.init();
  }

  declineConsent(): void {
    this.consentService.decline();
  }

  ngOnInit(): void {
    // Load available seasons (lightweight index, no DB download).
    this.seasonService.loadAvailableSeasons();

    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.isHomePage = event.url === '/' || event.url.startsWith('/?');
      this.routeKey = event.urlAfterRedirects.split('?')[0];
    });

    this.favoritesService.favoritesCount$.subscribe(count => {
      this.favoritesCount = count;
    });
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  selectSeason(season: string): void {
    this.seasonService.setSeason(season);
    this.tracking.track('Season Changed', { season });
  }

  openDsvWebsite(): void {
    this.tracking.track('External Link Clicked', { destination: 'DSV Website' });
    window.open('https://dsvdaten.dsv.de/Modules/WB/Index.aspx', '_blank');
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
    this.tracking.track('Theme Toggled', {
      theme: this.themeService.isDarkMode() ? 'dark' : 'light',
    });
  }

  getThemeIcon(): string {
    return this.themeService.isDarkMode() ? 'light_mode' : 'dark_mode';
  }

  getThemeTooltip(): string {
    return this.themeService.isDarkMode() ? 'Light Mode aktivieren' : 'Dark Mode aktivieren';
  }
}
