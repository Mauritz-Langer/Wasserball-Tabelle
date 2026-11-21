import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { Games } from '../../models/games';
import { parseGameDate, parseScore, hasTime, timeLabel, shortDate, dayLabel } from '../../models/game-utils';
import { parseGameLink, gameKey } from '../../models/game-ref';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { TeamFavoritesService } from '../../services/favorites/team-favorites.service';
import { LogoFallbackDirective } from '../../directives/logo-fallback.directive';
import { teamInitial } from '../../models/game-utils';
import { TeamIndexService } from '../../services/team-index/team-index.service';

/**
 * One game as a compact, tappable row: both teams stacked with their scores on
 * the right, kick-off or status on the left. Used by every list in the app
 * (league fixtures, team page, home feed, live list) and always leads to the
 * game centre.
 */
@Component({
  selector: 'app-game-row',
  imports: [RouterLink, MatIcon, LogoFallbackDirective],
  templateUrl: './game-row.component.html',
  styleUrl: './game-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameRowComponent {
  private ticker = inject(LiveTickerService);
  teamIndex = inject(TeamIndexService);
  private teamFavorites = inject(TeamFavoritesService);

  readonly game = input.required<Games>();
  /** League link the game belongs to (lets the game centre show context). */
  readonly ligaParam = input<string | null>(null);
  /** Show the date next to the time (lists that are not grouped by day). */
  readonly showDate = input(false);
  /** Extra line under the teams, e.g. the league name. */
  readonly context = input<string>('');
  /** Colour the result from this team's point of view. */
  readonly perspective = input<string>('');

  readonly date = computed(() => parseGameDate(this.game().start));

  /** Ticker entry while the game is being played. */
  readonly live = computed(() => {
    const ref = parseGameLink(this.game().gameLink);
    if (!ref) return null;
    const entry = this.ticker.byKey().get(gameKey(ref));
    return entry && this.ticker.statusOf(entry) === 'live' ? entry : null;
  });

  readonly score = computed<[number, number] | null>(() => {
    const live = this.live();
    return parseScore(live ? this.ticker.scoreOf(live) : this.game().result);
  });

  readonly played = computed(() => !this.live() && this.score() !== null);

  readonly whenTop = computed(() => {
    const d = this.date();
    if (this.played()) return this.showDate() && d ? shortDate(d) : 'Ende';
    if (!d) return this.game().start || '–';
    return hasTime(this.game().start) ? timeLabel(d) : shortDate(d);
  });

  readonly whenSub = computed(() => {
    const d = this.date();
    if (!d || !this.showDate() || this.played()) return '';
    if (!hasTime(this.game().start)) return '';
    const label = dayLabel(d);
    return label.length <= 7 ? label : shortDate(d);
  });

  readonly homeFav = computed(() => this.teamFavorites.teams().includes(this.game().home));
  readonly guestFav = computed(() => this.teamFavorites.teams().includes(this.game().guest));

  /** W/D/L from `perspective`'s point of view (played games only). */
  readonly outcome = computed(() => {
    const team = this.perspective();
    const s = this.score();
    if (!team || !s || !this.played()) return '';
    if (s[0] === s[1]) return 'D';
    const homeWon = s[0] > s[1];
    return (this.game().home === team) === homeWon ? 'W' : 'L';
  });

  readonly queryParams = computed(() => ({
    param: this.game().gameLink,
    ...(this.ligaParam() ? { ligaParam: this.ligaParam() } : {})
  }));

  readonly label = computed(() => {
    const g = this.game();
    const s = this.score();
    return `${g.home} gegen ${g.guest}` + (s ? `, ${s[0]} zu ${s[1]}` : '') + (this.live() ? ', läuft' : '');
  });

  initial(name: string): string {
    return teamInitial(name);
  }
}
