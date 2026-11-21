import { Games } from './games';

/**
 * Shared helpers for game dates, scores and outcomes. Every view (league hub,
 * team page, home feed, game centre) goes through these so a date or result is
 * interpreted the same way everywhere.
 */

/**
 * Parse the date formats that occur in the app:
 *  - DSV list:   "02.10.26, 20:30 Uhr"
 *  - DSV report: "02.10.2026 20:30 Uhr"
 *  - Liveticker: "2026-10-02T20:30:00"
 * Returns null when the value cannot be interpreted.
 */
export function parseGameDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = v.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  const date = new Date(year, parseInt(m[2], 10) - 1, parseInt(m[1], 10),
    m[4] ? parseInt(m[4], 10) : 0, m[5] ? parseInt(m[5], 10) : 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whether the start string carries a time of day (not just a date). */
export function hasTime(value: string | null | undefined): boolean {
  return !!value && /\d{1,2}:\d{2}/.test(value);
}

/** "17:8" -> [17, 8]; anything that is not a final score -> null. */
export function parseScore(result: string | null | undefined): [number, number] | null {
  if (!result) return null;
  const m = result.trim().match(/^(\d+)\s*:\s*(\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

export function isPlayed(game: Pick<Games, 'result'>): boolean {
  return parseScore(game.result) !== null;
}

export type Outcome = 'W' | 'D' | 'L';

/** Result of a played game from one team's point of view. */
export function outcomeFor(game: Games, team: string): Outcome | null {
  const score = parseScore(game.result);
  if (!score) return null;
  const [h, g] = score;
  if (h === g) return 'D';
  if (game.home === team) return h > g ? 'W' : 'L';
  if (game.guest === team) return g > h ? 'W' : 'L';
  return null;
}

export function involves(game: Games, team: string): boolean {
  return game.home === team || game.guest === team;
}

export function gameTime(game: Games): number {
  return parseGameDate(game.start)?.getTime() ?? 0;
}

/** Local calendar-day key, e.g. "2026-10-02". */
export function dayKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

/** "Heute", "Morgen", "Gestern" or "Sa, 3. Okt." (year added when it differs). */
export function dayLabel(date: Date, now = new Date()): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(date) - startOf(now)) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  const base = `${WEEKDAYS[date.getDay()]}, ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** "20:30" */
export function timeLabel(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** "3. Okt." — compact date for rows that are not grouped by day. */
export function shortDate(date: Date): string {
  return `${date.getDate()}.${date.getMonth() + 1}.`;
}

/** German decimal with one digit: 5.33 -> "5,3". */
export function decimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',');
}

/** Form (latest first) of a team from a list of games. */
export function formOf(games: Games[], team: string, count = 5): Outcome[] {
  return games
    .filter(g => involves(g, team) && isPlayed(g))
    .sort((a, b) => gameTime(b) - gameTime(a))
    .slice(0, count)
    .map(g => outcomeFor(g, team) as Outcome);
}

/**
 * Letter shown when a team has no logo: the first letter of the first "real"
 * word, skipping club-type prefixes and years ("SV 1957 Georgsmarienhütte" -> "G").
 */
export function teamInitial(name: string | null | undefined): string {
  const words = (name || '').split(/[\s/.-]+/).filter(Boolean);
  const word = words.find(w => /^\p{L}{4,}/u.test(w)) ?? words.find(w => /^\p{L}/u.test(w)) ?? '?';
  return word.charAt(0).toUpperCase();
}

/**
 * Call `refresh` when the page becomes visible again after at least `minAgeMs`
 * (the user switches back to the app after a while). Returns a function that
 * removes the listener. `loadedAt` reports when the data was last loaded.
 */
export function refreshOnReturn(loadedAt: () => number, refresh: () => void, minAgeMs = 3 * 60_000): () => void {
  const handler = () => {
    if (document.visibilityState === 'visible' && Date.now() - loadedAt() > minAgeMs) refresh();
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
