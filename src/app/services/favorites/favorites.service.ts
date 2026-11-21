import { Injectable, computed, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

/** A league the user follows or has opened. */
export interface LeagueRef {
  name: string;
  gender: string;
  link: string;
}

const FAVORITES_KEY = 'favorites';
const RECENT_KEY = 'recent-leagues';
const MAX_RECENT = 6;

/**
 * The user's favourite leagues and recently opened leagues (localStorage).
 *
 * Leagues are matched by NAME: DSV league links carry the season, so last
 * season's favourite keeps working once the new season's link is known (see
 * `reconcile`).
 */
@Injectable({
  providedIn: 'root'
})
export class FavoritesService {
  private readonly _leagues = signal<LeagueRef[]>(this.read(FAVORITES_KEY));
  private readonly _recent = signal<LeagueRef[]>(this.read(RECENT_KEY));

  readonly leagues = this._leagues.asReadonly();
  readonly recent = this._recent.asReadonly();
  readonly count = computed(() => this._leagues().length);

  /** Kept for consumers that still use the observable API. */
  readonly favoritesCount$: Observable<number> = toObservable(this.count);

  private read(key: string): LeagueRef[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(e => e && typeof e.name === 'string')
        .map(e => ({ name: e.name, gender: e.gender ?? '', link: e.link ?? '' }));
    } catch {
      return [];
    }
  }

  private write(key: string, value: LeagueRef[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable – keep in-memory only */
    }
  }

  /** Re-read favourites from storage (e.g. after another tab changed them). */
  updateCount(): void {
    this._leagues.set(this.read(FAVORITES_KEY));
  }

  getCount(): number {
    return this.count();
  }

  isFavorite(name: string): boolean {
    return this._leagues().some(l => l.name === name);
  }

  /** Toggle a league; returns true when it is a favourite afterwards. */
  toggle(league: LeagueRef): boolean {
    const exists = this.isFavorite(league.name);
    const next = exists
      ? this._leagues().filter(l => l.name !== league.name)
      : [...this._leagues(), { name: league.name, gender: league.gender ?? '', link: league.link }];
    this._leagues.set(next);
    this.write(FAVORITES_KEY, next);
    return !exists;
  }

  /** Remember an opened league (most recent first). */
  addRecent(league: LeagueRef): void {
    if (!league.name || !league.link) return;
    const next = [league, ...this._recent().filter(l => l.name !== league.name)].slice(0, MAX_RECENT);
    this._recent.set(next);
    this.write(RECENT_KEY, next);
  }

  /**
   * Update stored links from the current league index, so favourites saved in
   * an earlier season point at this season's league.
   */
  reconcile(current: LeagueRef[]): void {
    const byName = new Map(current.map(l => [l.name, l]));
    const fix = (list: LeagueRef[]) => {
      let changed = false;
      const next = list.map(l => {
        const now = byName.get(l.name);
        if (now && now.link !== l.link) { changed = true; return { ...l, link: now.link, gender: now.gender || l.gender }; }
        return l;
      });
      return changed ? next : null;
    };
    const favs = fix(this._leagues());
    if (favs) { this._leagues.set(favs); this.write(FAVORITES_KEY, favs); }
    const recent = fix(this._recent());
    if (recent) { this._recent.set(recent); this.write(RECENT_KEY, recent); }
  }
}
