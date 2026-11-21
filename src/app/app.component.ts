import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { MatIcon } from "@angular/material/icon";
import { MatProgressBar } from "@angular/material/progress-bar";
import { MatMenuModule } from "@angular/material/menu";
import { filter, map } from "rxjs";
import { FavoritesService } from "./services/favorites/favorites.service";
import { ThemeService } from "./services/theme/theme.service";
import { SeasonService } from "./services/season/season.service";
import { DatabaseService } from "./services/database/database.service";
import { ConsentService } from "./services/consent/consent.service";
import { TrackingService } from "./services/tracking/tracking.service";
import { LiveTickerService } from "./services/live-ticker/live-ticker.service";
import { NavigationService } from "./services/navigation/navigation.service";

interface NavItem { path: string; label: string; icon: string; exact?: boolean; }

@Component({
    selector: 'app-root',
    imports: [
        RouterOutlet,
        RouterLink,
        RouterLinkActive,
        MatIcon,
        MatProgressBar,
        MatMenuModule
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit {
  private router = inject(Router);
  private favoritesService = inject(FavoritesService);
  private tracking = inject(TrackingService);
  themeService = inject(ThemeService);
  seasonService = inject(SeasonService);
  databaseService = inject(DatabaseService);
  consentService = inject(ConsentService);
  liveTicker = inject(LiveTickerService);
  // Created with the shell so it sees every navigation from the start.
  private navigation = inject(NavigationService);

  readonly nav: NavItem[] = [
    { path: '/', label: 'Start', icon: 'home', exact: true },
    { path: '/ligen', label: 'Ligen', icon: 'emoji_events' },
    { path: '/live', label: 'Live', icon: 'bolt' },
    { path: '/analytics', label: 'Statistik', icon: 'insights' }
  ];

  /** Path of the current page (without query string). */
  readonly path = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects.split('?')[0])
    ),
    { initialValue: '/' }
  );

  readonly isHomePage = computed(() => this.path() === '/');
  readonly favoritesCount = this.favoritesService.count;
  /** Games being played right now (known while a view keeps the ticker open). */
  readonly liveCount = computed(() => this.liveTicker.liveNowKeys().size);

  readonly installPrompt = signal<any>(null);
  readonly offline = signal(typeof navigator !== 'undefined' && navigator.onLine === false);

  constructor() {
    // GDPR: only initialise tracking after the user has explicitly consented.
    if (this.consentService.hasConsent) {
      this.tracking.init();
    }
    // Offer installation from our own menu instead of the browser's banner.
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.installPrompt.set(e);
    });
    window.addEventListener('appinstalled', () => this.installPrompt.set(null));
    window.addEventListener('offline', () => this.offline.set(true));
    window.addEventListener('online', () => this.offline.set(false));
  }

  ngOnInit(): void {
    // Load available seasons (lightweight index, no DB download).
    this.seasonService.loadAvailableSeasons();
  }

  acceptConsent(): void {
    this.consentService.accept();
    this.tracking.init();
  }

  declineConsent(): void {
    this.consentService.decline();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  selectSeason(season: string): void {
    if (season === this.seasonService.currentSeason()) return;
    this.seasonService.setSeason(season);
    this.tracking.track('Season Changed', { season });
    // A league, team or game belongs to one season: show the leagues of the
    // chosen season instead of keeping a page that no longer matches.
    const path = this.router.url.split('?')[0];
    if (['/liga', '/team', '/game-details'].includes(path)) {
      this.router.navigate(['/ligen']);
    }
  }

  backToLiveSeason(): void {
    this.selectSeason(this.seasonService.liveSeason());
  }

  openDsvWebsite(): void {
    this.tracking.track('External Link Clicked', { destination: 'DSV Website' });
    window.open('https://dsvdaten.dsv.de/Modules/WB/Index.aspx', '_blank', 'noopener');
  }

  toggleTheme(): void {
    this.themeService.cycleTheme();
    this.tracking.track('Theme Toggled', { theme: this.themeService.currentTheme() });
  }

  getThemeIcon(): string {
    const theme = this.themeService.currentTheme();
    return theme === 'dark' ? 'dark_mode' : theme === 'light' ? 'light_mode' : 'brightness_auto';
  }

  getThemeLabel(): string {
    const theme = this.themeService.currentTheme();
    return theme === 'dark' ? 'Dunkel' : theme === 'light' ? 'Hell' : 'Wie System';
  }

  async install(): Promise<void> {
    const prompt = this.installPrompt();
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    this.installPrompt.set(null);
  }
}
