import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SubItem } from '../../models/subItem';
import { logoUrl } from '../database/database.service';

export interface TeamHit {
  team: string;
  /** Leagues of the running season this team probably plays in (best first). */
  leagues: SubItem[];
}

/** One result line: a team in one league (clubs often field several teams under one name). */
export interface TeamRow { team: string; league: SubItem | null; }

/** Flatten hits into one row per team and league (max. `limit` rows). */
export function teamRows(hits: TeamHit[], limit = 8): TeamRow[] {
  return hits
    .flatMap((h): TeamRow[] => (h.leagues.length
      ? h.leagues.slice(0, 3).map(league => ({ team: h.team, league }))
      : [{ team: h.team, league: null }]))
    .slice(0, limit);
}

const norm = (text: string) => (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** "Wasserball Bundesliga Männer Vorrunde" -> "wasserball bundesliga manner" */
export function baseLeagueName(name: string): string {
  return norm(name)
    .replace(/\s+(vorrunde|playoffs?|playoff\b.*|endrunde|zwischenrunde|hauptrunde|finalrunde|platzierungsrunde|relegation|gruppe)\b.*$/, '')
    .replace(/\s+[a-h1-9]$/, '')
    .trim();
}

/** Club part of a team name: "SV Krefeld 72 II" -> "sv krefeld 72". */
export function clubKey(name: string): string {
  return norm(name).replace(/\s+(i{1,3}|iv|[2-5])$/, '');
}

interface TeamIndexFile {
  teams: Record<string, string[]>;
  /** Team name -> hash of its most recent archived logo. */
  logos?: Record<string, string>;
}

/**
 * Find teams by name. DSV publishes no team list for the running season, so
 * the archive build writes the teams of the latest archived season with their
 * leagues (archive/teams.json); a league of the same (base) name in the
 * running season is where the team most likely plays now.
 */
@Injectable({ providedIn: 'root' })
export class TeamIndexService {
  private http = inject(HttpClient);
  private index: Promise<Record<string, string[]>> | null = null;
  readonly ready = signal(false);
  /** Logo lookup (exact name and club name), null until the index is loaded. */
  private readonly logos = signal<Map<string, string> | null>(null);

  private load(): Promise<Record<string, string[]>> {
    this.index ??= firstValueFrom(this.http.get<TeamIndexFile>('assets/data/archive/teams.json'))
      .then(r => {
        const logos = new Map<string, string>();
        for (const [team, hash] of Object.entries(r?.logos ?? {})) {
          const url = logoUrl(hash);
          logos.set(team, url);
          if (!logos.has(clubKey(team))) logos.set(clubKey(team), url);
        }
        this.logos.set(logos);
        this.ready.set(true);
        return r?.teams ?? {};
      })
      .catch(() => { this.index = null; return {}; });
    return this.index;
  }

  /**
   * Archive logo for a team the current page has no logo for (the liveticker
   * sends none, some league pages lack one): by exact name, else by club
   * ("… II" plays under the club's crest). '' while loading or unknown.
   */
  logoFor(name: string | null | undefined): string {
    if (!name) return '';
    const logos = this.logos();
    if (!logos) {
      void this.load();
      return '';
    }
    return logos.get(name) ?? logos.get(clubKey(name)) ?? '';
  }

  /** Start downloading the index (e.g. when a search field gets focus). */
  warmUp(): void {
    this.load();
  }

  /**
   * Teams whose name contains the query, with matching leagues of the given
   * (running) season. Teams starting with the query come first.
   */
  async search(query: string, current: SubItem[], limit = 6): Promise<TeamHit[]> {
    const q = norm(query);
    if (q.length < 2) return [];
    const teams = await this.load();
    const byName = new Map<string, SubItem[]>();
    const byBase = new Map<string, SubItem[]>();
    for (const l of current) {
      const n = norm(l.name), b = baseLeagueName(l.name);
      byName.set(n, [...(byName.get(n) ?? []), l]);
      byBase.set(b, [...(byBase.get(b) ?? []), l]);
    }
    const hits: TeamHit[] = [];
    for (const [team, leagues] of Object.entries(teams)) {
      const t = norm(team);
      if (!t.includes(q)) continue;
      const found = new Map<string, SubItem>();
      for (const name of leagues) for (const l of byName.get(norm(name)) ?? []) found.set(l.link, l);
      if (!found.size) for (const name of leagues) for (const l of byBase.get(baseLeagueName(name)) ?? []) found.set(l.link, l);
      hits.push({ team, leagues: [...found.values()] });
    }
    return hits
      .sort((a, b) => Number(norm(b.team).startsWith(q)) - Number(norm(a.team).startsWith(q))
        || Number(b.leagues.length > 0) - Number(a.leagues.length > 0)
        || a.team.localeCompare(b.team, 'de'))
      .slice(0, limit);
  }
}
