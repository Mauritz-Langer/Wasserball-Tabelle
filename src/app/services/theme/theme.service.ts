import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark' | 'auto';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  // Signal für reaktives Theme-Management
  private readonly THEME_STORAGE_KEY = 'app-theme';

  // Aktuelles Theme (light, dark, auto)
  public currentTheme = signal<Theme>(this.getInitialTheme());

  // Effektives Theme (light oder dark - aufgelöst von auto)
  public effectiveTheme = signal<'light' | 'dark'>('light');

  constructor() {
    // Initialisiere Theme beim Start
    this.applyTheme(this.currentTheme());

    // Reagiere auf Theme-Änderungen
    effect(() => {
      const theme = this.currentTheme();
      this.applyTheme(theme);
      this.saveTheme(theme);
    }, { allowSignalWrites: true });

    // Lausche auf System-Theme-Änderungen
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeQuery.addEventListener('change', () => {
        if (this.currentTheme() === 'auto') {
          this.updateEffectiveTheme(this.currentTheme());
        }
      });
    }
  }

  /**
   * Ermittelt das initiale Theme
   */
  private getInitialTheme(): Theme {
    // 1. Prüfe LocalStorage
    const savedTheme = localStorage.getItem(this.THEME_STORAGE_KEY) as Theme;
    if (savedTheme && ['light', 'dark', 'auto'].includes(savedTheme)) {
      return savedTheme;
    }

    // 2. Fallback auf Light Mode (nicht Auto)
    return 'light';
  }

  /**
   * Wendet das Theme an
   */
  private applyTheme(theme: Theme): void {
    const body = document.body;
    const effectiveTheme = this.resolveEffectiveTheme(theme);

    // Entferne alle Theme-Klassen
    body.classList.remove('light-theme', 'dark-theme');

    // Füge neue Theme-Klasse hinzu
    body.classList.add(`${effectiveTheme}-theme`);

    // Update effective theme signal
    this.effectiveTheme.set(effectiveTheme);
  }

  /**
   * Löst 'auto' in 'light' oder 'dark' auf
   */
  private resolveEffectiveTheme(theme: Theme): 'light' | 'dark' {
    if (theme === 'auto') {
      // Prüfe System-Präferenz
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    }
    return theme;
  }

  /**
   * Update effective theme (für external changes)
   */
  private updateEffectiveTheme(theme: Theme): void {
    const effectiveTheme = this.resolveEffectiveTheme(theme);
    this.effectiveTheme.set(effectiveTheme);

    const body = document.body;
    body.classList.remove('light-theme', 'dark-theme');
    body.classList.add(`${effectiveTheme}-theme`);
  }

  /**
   * Speichert Theme in LocalStorage
   */
  private saveTheme(theme: Theme): void {
    localStorage.setItem(this.THEME_STORAGE_KEY, theme);
  }

  /**
   * Setzt ein neues Theme
   */
  public setTheme(theme: Theme): void {
    this.currentTheme.set(theme);
  }

  /**
   * Toggelt zwischen Light und Dark
   */
  public toggleTheme(): void {
    const current = this.currentTheme();
    // Nur zwischen light und dark wechseln (nicht auto)
    if (current === 'light') {
      this.setTheme('dark');
    } else if (current === 'dark') {
      this.setTheme('light');
    } else {
      // Falls auto, wechsle basierend auf effectiveTheme
      const effective = this.effectiveTheme();
      this.setTheme(effective === 'light' ? 'dark' : 'light');
    }
  }

  /**
   * Prüft ob Dark Mode aktiv ist
   */
  public isDarkMode(): boolean {
    return this.currentTheme() === 'dark';
  }
}

