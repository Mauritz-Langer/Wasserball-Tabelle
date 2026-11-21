import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TrackingService } from '../../services/tracking/tracking.service';
import { OverviewService } from '../../services/overview/overview.service';
import { SeasonService } from '../../services/season/season.service';
import { FavoritesService } from '../../services/favorites/favorites.service';
import { Item } from '../../models/item';
import { TeamIndexService, TeamRow, teamRows } from '../../services/team-index/team-index.service';
import { SubItem } from '../../models/subItem';
import { LogoFallbackDirective } from '../../directives/logo-fallback.directive';
import { teamInitial } from '../../models/game-utils';

type Gender = 'all' | 'm' | 'w' | 'x';

/** Normalise DSV's gender text ("männlich", "Frauen", "mixed", …). */
export function genderOf(text: string): Exclude<Gender, 'all'> | '' {
  const g = (text || '').toLowerCase();
  if (g.includes('weibl') || g.includes('frau') || g.includes('damen') || g.includes('mädchen')) return 'w';
  if (g.includes('männ') || g.includes('herren') || g.includes('knaben')) return 'm';
  if (g.includes('mixed') || g.includes('gemischt')) return 'x';
  return '';
}

/**
 * League browser: every league of the selected season, grouped by association,
 * searchable, with favourites one tap away.
 */
@Component({
  selector: 'app-overview',
  imports: [RouterLink, FormsModule, MatIcon, LogoFallbackDirective],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverviewComponent {
  private overviewService = inject(OverviewService);
  private tracking = inject(TrackingService);
  private snackBar = inject(MatSnackBar);
  seasonService = inject(SeasonService);
  favoritesService = inject(FavoritesService);
  teamIndex = inject(TeamIndexService);
  /** Teams matching the search, with the league they probably play in. */
  readonly teamHits = signal<TeamRow[]>([]);

  readonly items = signal<Item[]>([]);
  readonly isLoading = signal(true);
  readonly failed = signal(false);
  readonly searchTerm = signal('');
  readonly gender = signal<Gender>('all');
  /** Categories the user expanded (by name). */
  readonly opened = signal<Set<string>>(new Set());

  private readonly reload = signal(0);

  readonly genders: { id: Gender; label: string }[] = [
    { id: 'all', label: 'Alle' },
    { id: 'm', label: 'Männlich' },
    { id: 'w', label: 'Weiblich' },
    { id: 'x', label: 'Mixed' }
  ];

  readonly isFiltering = computed(() => !!this.searchTerm().trim() || this.gender() !== 'all');

  readonly filteredItems = computed<Item[]>(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const gender = this.gender();
    if (!term && gender === 'all') return this.items();
    return this.items()
      .map(item => ({
        ...item,
        subItems: item.subItems.filter(sub =>
          (gender === 'all' || genderOf(sub.gender) === gender) &&
          (!term || sub.name.toLowerCase().includes(term) || item.name.toLowerCase().includes(term)))
      }))
      .filter(item => item.subItems.length > 0);
  });

  readonly totalCount = computed(() => this.items().reduce((n, i) => n + i.subItems.length, 0));
  readonly resultCount = computed(() => this.filteredItems().reduce((n, i) => n + i.subItems.length, 0));

  /** Favourite leagues that exist in the loaded season. */
  readonly favorites = computed<SubItem[]>(() => {
    const names = new Set(this.favoritesService.leagues().map(l => l.name));
    return this.items().flatMap(i => i.subItems).filter(s => names.has(s.name));
  });

  constructor() {
    toObservable(computed(() => [this.seasonService.currentSeason(), this.reload()] as const)).pipe(
      tap(() => { this.isLoading.set(true); this.failed.set(false); }),
      switchMap(([, attempt]) => this.overviewService.getItems(attempt > 0).pipe(
        catchError(error => {
          console.error('Error loading items:', error);
          this.failed.set(true);
          return of([] as Item[]);
        })
      )),
      takeUntilDestroyed()
    ).subscribe(items => {
      this.items.set(items);
      this.isLoading.set(false);
      if (items.length) {
        // The first category (national leagues) starts expanded.
        if (!items.some(i => this.opened().has(i.name))) this.opened.set(new Set([items[0].name]));
        if (this.seasonService.isCurrentSeason) {
          this.favoritesService.reconcile(items.flatMap(i => i.subItems));
        }
      }
    });
  }

  retry(): void {
    this.reload.update(n => n + 1);
  }

  isOpen(item: Item): boolean {
    return this.isFiltering() || this.opened().has(item.name);
  }

  toggleCategory(item: Item): void {
    if (this.isFiltering()) return;
    const next = new Set(this.opened());
    next.has(item.name) ? next.delete(item.name) : next.add(item.name);
    this.opened.set(next);
  }

  setGender(gender: Gender): void {
    this.gender.set(gender);
  }

  private searchTimer?: ReturnType<typeof setTimeout>;

  private teamTimer?: ReturnType<typeof setTimeout>;

  onSearch(term: string): void {
    this.searchTerm.set(term);
    clearTimeout(this.teamTimer);
    if (term.trim().length < 2 || !this.seasonService.isLive()) this.teamHits.set([]);
    else this.teamTimer = setTimeout(async () => {
      const hits = await this.teamIndex.search(term, this.items().flatMap(i => i.subItems), 4);
      if (this.searchTerm() === term) this.teamHits.set(teamRows(hits.filter(h => h.leagues.length), 6));
    }, 200);
    clearTimeout(this.searchTimer);
    if (term.trim().length >= 3) {
      this.searchTimer = setTimeout(() => this.tracking.track('Search Performed', {
        searchTerm: term.trim().toLowerCase(),
        resultCount: this.resultCount()
      }), 1200);
    }
  }

  toggleFavorite(subItem: SubItem, withFeedback = true): void {
    const nowFavorite = this.favoritesService.toggle(subItem);
    this.tracking.track(nowFavorite ? 'Favorite Added' : 'Favorite Removed', { leagueName: subItem.name });
    if (withFeedback) {
      this.snackBar.open(nowFavorite ? 'Liga gemerkt' : 'Liga entfernt', 'Rückgängig')
        .onAction().subscribe(() => this.toggleFavorite(subItem, false));
    }
  }

  trackOpen(subItem: SubItem): void {
    this.tracking.track('League Selected', { leagueName: subItem.name });
  }

  genderLabel(text: string): string {
    switch (genderOf(text)) {
      case 'm': return 'männlich';
      case 'w': return 'weiblich';
      case 'x': return 'mixed';
      default: return '';
    }
  }

  /** A league whose next game is today or already running. */
  isHot(status: string | undefined): boolean {
    return !!status && /heute|live|läuft|min|std/i.test(status);
  }

  initial(name: string): string {
    return teamInitial(name);
  }
}
