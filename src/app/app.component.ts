import { Component, OnInit, inject } from '@angular/core';
import {Router, RouterOutlet, NavigationEnd} from '@angular/router';
import {MatToolbar} from "@angular/material/toolbar";
import {MatIcon} from "@angular/material/icon";
import {MatIconButton} from "@angular/material/button";
import * as amplitude from '@amplitude/unified';

import {MatTooltip} from "@angular/material/tooltip";
import {filter} from "rxjs";
import {FavoritesService} from "./services/favorites/favorites.service";
import {ThemeService} from "./services/theme/theme.service";

@Component({
    selector: 'app-root',
    imports: [
    MatToolbar,
    RouterOutlet,
    MatIcon,
    MatIconButton,
    MatTooltip
],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private router = inject(Router);
  private favoritesService = inject(FavoritesService);
  themeService = inject(ThemeService);

  isHomePage = true;
  currentYear = new Date().getFullYear();
  favoritesCount = 0;

  constructor() {
    amplitude.initAll('106978c8b7e8e15d1a519bf6fda3175d', {"analytics":{"autocapture":true},"sessionReplay":{"sampleRate":1}});
  }

  ngOnInit(): void {
    // Track route changes
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.isHomePage = event.url === '/' || event.url.startsWith('/?');
    });

    // Subscribe to favorites count changes
    this.favoritesService.favoritesCount$.subscribe(count => {
      this.favoritesCount = count;
    });
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  openDsvWebsite(): void {
    amplitude.track('External Link Clicked', { destination: 'DSV Website' });
    window.open('https://dsvdaten.dsv.de/Modules/WB/Index.aspx', '_blank');
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
    amplitude.track('Theme Toggled', {
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
