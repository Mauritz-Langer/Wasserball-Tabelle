import { Games } from './games';
import { parseGameDate } from './game-utils';

function stamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `T${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** Escape text for an iCalendar property value (RFC 5545 §3.3.11). */
function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Build an iCalendar document for the given games (90 minutes each). */
export function buildIcs(games: Games[], leagueName: string): string {
  const now = stamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WasserballTabelle//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const game of games) {
    const start = parseGameDate(game.start);
    if (!start) continue;
    const begin = stamp(start);
    const uid = `${begin}-${game.home}-${game.guest}`.replace(/[^\w-]/g, '') + '@wasserball-tabelle.de';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${begin}`,
      `DTEND:${stamp(new Date(start.getTime() + 90 * 60_000))}`,
      `SUMMARY:${esc(`${game.home} – ${game.guest}`)}`,
      `DESCRIPTION:${esc(`Wasserball, ${leagueName}`)}`,
      ...(game.location ? [`LOCATION:${esc(game.location)}`] : []),
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Download upcoming games as an .ics file. Returns the number of exported games. */
export function downloadCalendar(games: Games[], leagueName: string, fileLabel: string): number {
  const now = Date.now();
  const upcoming = games.filter(g => (parseGameDate(g.start)?.getTime() ?? 0) > now);
  if (!upcoming.length) return 0;

  const blob = new Blob([buildIcs(upcoming, leagueName)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spielplan_${fileLabel.replace(/[^\wäöüÄÖÜß-]+/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return upcoming.length;
}
