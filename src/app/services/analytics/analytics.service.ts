import { Injectable, inject } from '@angular/core';
import { DatabaseService, STATS_DB } from '../database/database.service';

/*
 * Statistics over all archived seasons.
 *
 * Everything runs in the browser on `stats.db` (see scripts/build-archive.js):
 *   leagues(no, id, season, name)        teams(id, name)
 *   players(id, name, birth_year)        clubs(id, name)
 *   games(id, league, day, home, guest, hs, gs)      -- played games, in time order
 *   scorers(player, league, club, goals, games)
 * The tables are small (≈24 000 games, ≈120 000 scorer rows), so a team's or
 * player's rows are fetched once and the figures are derived in TypeScript.
 */

export interface Totals { games: number; goals: number; teams: number; leagues: number; seasons: number; }
export interface SeasonPoint { season: number; games: number; leagues: number; avgGoals: number; homeWinPct: number;
    /** Only a small part of the season's games is archived: averages are not comparable. */
    partial: boolean; }
export interface Outcomes { home: number; draw: number; away: number; }
export interface Bucket { label: string; count: number; }
export interface TeamRank { id: number; name: string; games: number; winRate: number; avgScored: number; avgConceded: number; }
export interface GameRecord { id: string; day: string | null; home: string; guest: string; hs: number; gs: number; league: string; }
export interface Streak { teamId: number; team: string; count: number; from: string | null; to: string | null; }
export interface LevelStat { level: string; games: number; avgGoals: number; }
export interface MonthStat { month: number; games: number; avgGoals: number; }
export interface LeagueTightness { no: number; name: string; season: number; games: number; avgDiff: number; }

export interface TeamOption { id: number; name: string; games: number; }
export interface PlayerOption { id: number; name: string; birthYear: number | null; goals: number; }
export interface LeagueOption { no: number; id: string; name: string; season: number; }

export interface TeamGame {
    id: string; day: string | null; season: number; league: string;
    home: boolean; opponentId: number; opponent: string; own: number; other: number;
    result: 'W' | 'D' | 'L';
}
export interface WDL { games: number; wins: number; draws: number; losses: number; }
export interface TeamSeason extends WDL { season: number; scored: number; conceded: number; winRate: number; }
export interface Rival extends WDL { id: number; name: string; }
export interface TeamProfile {
    id: number; name: string;
    total: WDL & { scored: number; conceded: number; winRate: number; };
    home: WDL; away: WDL;
    seasons: TeamSeason[];
    rivals: Rival[];
    favourite: Rival | null;
    nemesis: Rival | null;
    biggestWins: TeamGame[];
    heaviestDefeats: TeamGame[];
    recent: TeamGame[];
    longestWinStreak: number;
}

export interface PlayerSeason { season: number; goals: number; games: number; avg: number; }
export interface PlayerStation { season: number; club: string; league: string; leagueId: string; goals: number; games: number; }
/** One season at one club, with all competitions played in. */
export interface PlayerSpell { season: number; club: string; goals: number; games: number; leagues: { name: string; id: string }[]; }
export interface PlayerProfile {
    id: number; name: string; birthYear: number | null;
    goals: number; games: number; avg: number;
    seasons: PlayerSeason[];
    stations: PlayerStation[];
    spells: PlayerSpell[];
    best: PlayerSpell | null;
    clubs: string[];
}
export interface ScorerRank { id: number; name: string; birthYear: number | null; goals: number; games: number; avg: number; seasons: number; clubs: number; }

export interface LeagueProfile {
    no: number; id: string; name: string; season: number;
    games: number; goals: number; avgGoals: number; maxGoals: number;
    outcomes: Outcomes;
    scorers: { id: number; name: string; club: string; goals: number; games: number }[];
}

const round = (value: number, digits = 1) => {
    const f = 10 ** digits;
    return Math.round(value * f) / f;
};
const pct = (part: number, total: number) => (total ? round(100 * part / total) : 0);

@Injectable({
    providedIn: 'root'
})
export class AnalyticsService {
    private db = inject(DatabaseService);

    private q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
        return this.db.query<T>(STATS_DB, sql, params);
    }

    /** `AND l.season = ?` for queries that join leagues as `l`. */
    private season(season?: number): { sql: string; params: number[] } {
        return season ? { sql: ' AND l.season = ?', params: [season] } : { sql: '', params: [] };
    }

    // ---- Overview -----------------------------------------------------------

    async getSeasons(): Promise<number[]> {
        return (await this.q<{ season: number }>(`SELECT DISTINCT season FROM leagues ORDER BY season DESC`)).map(r => r.season);
    }

    async getTotals(season?: number): Promise<Totals> {
        const f = this.season(season);
        const [row] = await this.q<Totals>(`
            SELECT COUNT(*) AS games,
                   COALESCE(SUM(g.hs + g.gs), 0) AS goals,
                   COUNT(DISTINCT g.league) AS leagues,
                   COUNT(DISTINCT l.season) AS seasons,
                   (SELECT COUNT(*) FROM (
                        SELECT g2.home AS t FROM games g2 JOIN leagues l ON l.no = g2.league WHERE 1 = 1${f.sql}
                        UNION
                        SELECT g2.guest FROM games g2 JOIN leagues l ON l.no = g2.league WHERE 1 = 1${f.sql})) AS teams
            FROM games g JOIN leagues l ON l.no = g.league
            WHERE 1 = 1${f.sql}`, [...f.params, ...f.params, ...f.params]);
        return row ?? { games: 0, goals: 0, teams: 0, leagues: 0, seasons: 0 };
    }

    /** One point per season: volume, scoring level and home advantage. */
    async getSeasonTrend(): Promise<SeasonPoint[]> {
        const rows = await this.q<any>(`
            SELECT l.season, COUNT(*) AS games, COUNT(DISTINCT g.league) AS leagues,
                   AVG(g.hs + g.gs) AS avgGoals,
                   SUM(g.hs > g.gs) AS homeWins
            FROM games g JOIN leagues l ON l.no = g.league
            GROUP BY l.season ORDER BY l.season`);
        // A season with far fewer archived games than usual (the first year of
        // the archive, a season scraped mid-way) is a different sample — mostly
        // top leagues — and would distort any trend line.
        const sorted = rows.map(r => r.games).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
        return rows.map(r => ({
            season: r.season, games: r.games, leagues: r.leagues,
            avgGoals: round(r.avgGoals, 1), homeWinPct: pct(r.homeWins, r.games),
            partial: r.games < median * 0.4
        }));
    }

    async getOutcomes(season?: number): Promise<Outcomes> {
        const f = this.season(season);
        const [row] = await this.q<Outcomes>(`
            SELECT COALESCE(SUM(g.hs > g.gs), 0) AS home,
                   COALESCE(SUM(g.hs = g.gs), 0) AS draw,
                   COALESCE(SUM(g.hs < g.gs), 0) AS away
            FROM games g JOIN leagues l ON l.no = g.league WHERE 1 = 1${f.sql}`, f.params);
        return row ?? { home: 0, draw: 0, away: 0 };
    }

    /** How many goals a game has, in steps of five. */
    async getGoalBuckets(season?: number): Promise<Bucket[]> {
        const f = this.season(season);
        const rows = await this.q<{ b: number; count: number }>(`
            SELECT MIN((g.hs + g.gs) / 5, 8) AS b, COUNT(*) AS count
            FROM games g JOIN leagues l ON l.no = g.league WHERE 1 = 1${f.sql}
            GROUP BY b ORDER BY b`, f.params);
        const byBucket = new Map(rows.map(r => [r.b, r.count]));
        return Array.from({ length: 9 }, (_, b) => ({
            label: b === 8 ? '40+' : `${b * 5}–${b * 5 + 4}`,
            count: byBucket.get(b) ?? 0
        }));
    }

    async getTopTeams(limit = 10, season?: number): Promise<TeamRank[]> {
        const f = this.season(season);
        const rows = await this.q<any>(`
            SELECT t.id, t.name, COUNT(*) AS games, SUM(x.own > x.other) AS wins,
                   AVG(x.own) AS avgScored, AVG(x.other) AS avgConceded
            FROM (
                SELECT g.home AS team, g.hs AS own, g.gs AS other, g.league FROM games g
                UNION ALL
                SELECT g.guest, g.gs, g.hs, g.league FROM games g
            ) x
            JOIN leagues l ON l.no = x.league
            JOIN teams t ON t.id = x.team
            WHERE 1 = 1${f.sql}
            GROUP BY t.id
            HAVING COUNT(*) >= ?
            ORDER BY 1.0 * SUM(x.own > x.other) / COUNT(*) DESC, COUNT(*) DESC
            LIMIT ?`, [...f.params, season ? 6 : 30, limit]);
        return rows.map(r => ({
            id: r.id, name: r.name, games: r.games, winRate: pct(r.wins, r.games),
            avgScored: round(r.avgScored), avgConceded: round(r.avgConceded)
        }));
    }

    private gameRecords(order: string, limit: number, season?: number): Promise<GameRecord[]> {
        const f = this.season(season);
        return this.q<GameRecord>(`
            SELECT g.id, g.day, th.name AS home, tg.name AS guest, g.hs, g.gs, l.name AS league
            FROM games g
            JOIN leagues l ON l.no = g.league
            JOIN teams th ON th.id = g.home
            JOIN teams tg ON tg.id = g.guest
            WHERE 1 = 1${f.sql}
            ORDER BY ${order} LIMIT ?`, [...f.params, limit]);
    }

    getHighestScoringGames(limit = 5, season?: number): Promise<GameRecord[]> {
        return this.gameRecords('g.hs + g.gs DESC, g.day', limit, season);
    }

    getBiggestMargins(limit = 5, season?: number): Promise<GameRecord[]> {
        return this.gameRecords('ABS(g.hs - g.gs) DESC, g.day', limit, season);
    }

    /** Longest runs of consecutive wins (games are stored in time order). */
    async getWinningStreaks(limit = 5): Promise<Streak[]> {
        const games = await this.q<{ day: string | null; home: number; guest: number; hs: number; gs: number }>(
            `SELECT day, home, guest, hs, gs FROM games ORDER BY rowid`);
        const open = new Map<number, { count: number; from: string | null; to: string | null }>();
        const best = new Map<number, { count: number; from: string | null; to: string | null }>();
        const step = (team: number, won: boolean, day: string | null) => {
            if (!won) { open.delete(team); return; }
            const run = open.get(team) ?? { count: 0, from: day, to: day };
            run.count++; run.to = day;
            open.set(team, run);
            if (run.count > (best.get(team)?.count ?? 0)) best.set(team, { ...run });
        };
        for (const g of games) {
            step(g.home, g.hs > g.gs, g.day);
            step(g.guest, g.gs > g.hs, g.day);
        }
        const top = [...best.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, limit);
        if (!top.length) return [];
        const names = await this.q<{ id: number; name: string }>(
            `SELECT id, name FROM teams WHERE id IN (${top.map(() => '?').join(',')})`, top.map(t => t[0]));
        const nameOf = new Map(names.map(n => [n.id, n.name]));
        return top.map(([teamId, run]) => ({ teamId, team: nameOf.get(teamId) ?? '', ...run }));
    }

    async getLevelComparison(): Promise<LevelStat[]> {
        const rows = await this.q<any>(`
            SELECT CASE
                     WHEN l.name LIKE '%Bundesliga%' THEN 'Bundesliga'
                     WHEN l.name LIKE '%Pokal%' THEN 'Pokal'
                     WHEN l.name LIKE '%U1%' OR l.name LIKE '%U2%' OR l.name LIKE '%Jugend%' THEN 'Jugend'
                     WHEN l.name LIKE '%Oberliga%' THEN 'Oberliga'
                     WHEN l.name LIKE '%Verbandsliga%' THEN 'Verbandsliga'
                     WHEN l.name LIKE '%Bezirk%' THEN 'Bezirksliga'
                     ELSE 'Übrige'
                   END AS level,
                   COUNT(*) AS games, AVG(g.hs + g.gs) AS avgGoals
            FROM games g JOIN leagues l ON l.no = g.league
            GROUP BY level ORDER BY avgGoals DESC`);
        return rows.map(r => ({ level: r.level, games: r.games, avgGoals: round(r.avgGoals) }));
    }

    async getMonthPattern(): Promise<MonthStat[]> {
        const rows = await this.q<any>(`
            SELECT CAST(substr(day, 6, 2) AS INTEGER) AS month, COUNT(*) AS games, AVG(hs + gs) AS avgGoals
            FROM games WHERE day IS NOT NULL GROUP BY month ORDER BY month`);
        return rows.map(r => ({ month: r.month, games: r.games, avgGoals: round(r.avgGoals) }));
    }

    async getTightestLeagues(limit = 8): Promise<LeagueTightness[]> {
        const rows = await this.q<any>(`
            SELECT l.no, l.name, l.season, COUNT(*) AS games, AVG(ABS(g.hs - g.gs)) AS avgDiff
            FROM games g JOIN leagues l ON l.no = g.league
            GROUP BY l.no HAVING COUNT(*) >= 20
            ORDER BY AVG(ABS(g.hs - g.gs)) LIMIT ?`, [limit]);
        return rows.map(r => ({ ...r, avgDiff: round(r.avgDiff) }));
    }

    // ---- Search lists -------------------------------------------------------

    /** All teams, most active first (the default suggestions). */
    getTeams(): Promise<TeamOption[]> {
        return this.q<TeamOption>(`
            SELECT t.id, t.name, COUNT(x.team) AS games
            FROM teams t
            LEFT JOIN (SELECT home AS team FROM games UNION ALL SELECT guest FROM games) x ON x.team = t.id
            GROUP BY t.id ORDER BY games DESC, t.name`);
    }

    getPlayers(): Promise<PlayerOption[]> {
        return this.q<PlayerOption>(`
            SELECT p.id, p.name, p.birth_year AS birthYear, COALESCE(SUM(s.goals), 0) AS goals
            FROM players p LEFT JOIN scorers s ON s.player = p.id
            GROUP BY p.id ORDER BY goals DESC`);
    }

    getLeagues(): Promise<LeagueOption[]> {
        return this.q<LeagueOption>(`SELECT no, id, name, season FROM leagues ORDER BY season DESC, name`);
    }

    // ---- Team ---------------------------------------------------------------

    async getTeamProfile(teamId: number): Promise<TeamProfile | null> {
        const [team] = await this.q<{ id: number; name: string }>(`SELECT id, name FROM teams WHERE id = ?`, [teamId]);
        if (!team) return null;
        const rows = await this.q<any>(`
            SELECT g.id, g.day, l.season, l.name AS league, g.home, g.guest, g.hs, g.gs,
                   th.name AS homeName, tg.name AS guestName
            FROM games g
            JOIN leagues l ON l.no = g.league
            JOIN teams th ON th.id = g.home
            JOIN teams tg ON tg.id = g.guest
            WHERE g.home = ? OR g.guest = ?
            ORDER BY g.rowid`, [teamId, teamId]);

        const games: TeamGame[] = rows.map(r => {
            const home = r.home === teamId;
            const own = home ? r.hs : r.gs;
            const other = home ? r.gs : r.hs;
            return {
                id: r.id, day: r.day, season: r.season, league: r.league, home,
                opponentId: home ? r.guest : r.home, opponent: home ? r.guestName : r.homeName,
                own, other, result: own > other ? 'W' : own < other ? 'L' : 'D'
            };
        });

        const blank = (): WDL => ({ games: 0, wins: 0, draws: 0, losses: 0 });
        const count = (rec: WDL, g: TeamGame) => {
            rec.games++;
            if (g.result === 'W') rec.wins++; else if (g.result === 'L') rec.losses++; else rec.draws++;
        };
        const total = { ...blank(), scored: 0, conceded: 0, winRate: 0 };
        const home = blank(), away = blank();
        const seasons = new Map<number, TeamSeason>();
        const rivals = new Map<number, Rival>();
        let streak = 0, longest = 0;

        for (const g of games) {
            count(total, g);
            total.scored += g.own; total.conceded += g.other;
            count(g.home ? home : away, g);

            let s = seasons.get(g.season);
            if (!s) seasons.set(g.season, s = { season: g.season, ...blank(), scored: 0, conceded: 0, winRate: 0 });
            count(s, g); s.scored += g.own; s.conceded += g.other;

            let r = rivals.get(g.opponentId);
            if (!r) rivals.set(g.opponentId, r = { id: g.opponentId, name: g.opponent, ...blank() });
            count(r, g);

            streak = g.result === 'W' ? streak + 1 : 0;
            longest = Math.max(longest, streak);
        }
        total.winRate = pct(total.wins, total.games);
        for (const s of seasons.values()) s.winRate = pct(s.wins, s.games);

        const rivalList = [...rivals.values()];
        const regular = rivalList.filter(r => r.games >= 3);
        const byMargin = (dir: 1 | -1) => games
            .filter(g => (dir === 1 ? g.result === 'W' : g.result === 'L'))
            .sort((a, b) => dir * ((b.own - b.other) - (a.own - a.other)))
            .slice(0, 5);

        return {
            ...team, total, home, away,
            seasons: [...seasons.values()].sort((a, b) => a.season - b.season),
            rivals: rivalList.sort((a, b) => b.games - a.games).slice(0, 8),
            favourite: regular.sort((a, b) => b.wins - a.wins || a.losses - b.losses)[0] ?? null,
            nemesis: [...regular].sort((a, b) => b.losses - a.losses || a.wins - b.wins)[0] ?? null,
            biggestWins: byMargin(1),
            heaviestDefeats: byMargin(-1),
            recent: games.slice(-8).reverse(),
            longestWinStreak: longest
        };
    }

    // ---- Player -------------------------------------------------------------

    async getPlayerProfile(playerId: number): Promise<PlayerProfile | null> {
        const [player] = await this.q<{ id: number; name: string; birthYear: number | null }>(
            `SELECT id, name, birth_year AS birthYear FROM players WHERE id = ?`, [playerId]);
        if (!player) return null;
        const stations = await this.q<PlayerStation>(`
            SELECT l.season, c.name AS club, l.name AS league, l.id AS leagueId, s.goals, s.games
            FROM scorers s
            JOIN leagues l ON l.no = s.league
            JOIN clubs c ON c.id = s.club
            WHERE s.player = ?
            ORDER BY l.season DESC, s.goals DESC`, [playerId]);

        const seasons = new Map<number, PlayerSeason>();
        let goals = 0, games = 0;
        for (const st of stations) {
            goals += st.goals; games += st.games;
            let s = seasons.get(st.season);
            if (!s) seasons.set(st.season, s = { season: st.season, goals: 0, games: 0, avg: 0 });
            s.goals += st.goals; s.games += st.games;
        }
        for (const s of seasons.values()) s.avg = s.games ? round(s.goals / s.games, 2) : 0;

        const spells = new Map<string, PlayerSpell>();
        for (const st of stations) {
            const key = `${st.season}|${st.club}`;
            let sp = spells.get(key);
            if (!sp) spells.set(key, sp = { season: st.season, club: st.club, goals: 0, games: 0, leagues: [] });
            sp.goals += st.goals; sp.games += st.games;
            sp.leagues.push({ name: st.league, id: st.leagueId });
        }
        const spellList = [...spells.values()].sort((a, b) => b.season - a.season || b.goals - a.goals);

        return {
            ...player, goals, games, avg: games ? round(goals / games, 2) : 0,
            seasons: [...seasons.values()].sort((a, b) => a.season - b.season),
            stations,
            spells: spellList,
            best: [...spellList].sort((a, b) => b.goals - a.goals)[0] ?? null,
            clubs: [...new Set(stations.map(s => s.club))]
        };
    }

    private async scorerRanks(where: string, having: string, order: string, limit: number, params: any[] = []): Promise<ScorerRank[]> {
        const rows = await this.q<any>(`
            SELECT p.id, p.name, p.birth_year AS birthYear, SUM(s.goals) AS goals, SUM(s.games) AS games,
                   COUNT(DISTINCT l.season) AS seasons, COUNT(DISTINCT s.club) AS clubs
            FROM scorers s
            JOIN players p ON p.id = s.player
            JOIN leagues l ON l.no = s.league
            ${where}
            GROUP BY p.id
            HAVING ${having}
            ORDER BY ${order} LIMIT ?`, [...params, limit]);
        return rows.map(r => ({ ...r, avg: r.games ? round(r.goals / r.games, 2) : 0 }));
    }

    // NB: HAVING/ORDER BY use the aggregates explicitly. A bare `goals` there
    // would resolve to the scorers column of one arbitrary row, not the sum.

    /** Most goals over all seasons (or in one season). */
    getTopScorers(limit = 50, season?: number): Promise<ScorerRank[]> {
        return season
            ? this.scorerRanks('WHERE l.season = ?', 'SUM(s.goals) > 0', 'SUM(s.goals) DESC', limit, [season])
            : this.scorerRanks('', 'SUM(s.goals) > 0', 'SUM(s.goals) DESC', limit);
    }

    /** Best goals-per-game average with a meaningful number of games. */
    getMostEfficient(limit = 50): Promise<ScorerRank[]> {
        return this.scorerRanks('', 'SUM(s.games) >= 30', '1.0 * SUM(s.goals) / SUM(s.games) DESC', limit);
    }

    /** Top scorers who are 21 or younger in the given year. */
    getYoungTalents(limit = 50, referenceYear = new Date().getFullYear()): Promise<ScorerRank[]> {
        return this.scorerRanks('WHERE p.birth_year >= ?', 'SUM(s.goals) >= 10', 'SUM(s.goals) DESC', limit, [referenceYear - 21]);
    }

    /** Players who scored for the most different clubs. */
    getJourneymen(limit = 50): Promise<ScorerRank[]> {
        return this.scorerRanks('', 'COUNT(DISTINCT s.club) >= 3', 'COUNT(DISTINCT s.club) DESC, SUM(s.goals) DESC', limit);
    }

    // ---- League -------------------------------------------------------------

    async getLeagueProfile(no: number): Promise<LeagueProfile | null> {
        const [league] = await this.q<LeagueOption>(`SELECT no, id, name, season FROM leagues WHERE no = ?`, [no]);
        if (!league) return null;
        const [agg] = await this.q<any>(`
            SELECT COUNT(*) AS games, COALESCE(SUM(hs + gs), 0) AS goals, COALESCE(MAX(hs + gs), 0) AS maxGoals,
                   COALESCE(SUM(hs > gs), 0) AS home, COALESCE(SUM(hs = gs), 0) AS draw, COALESCE(SUM(hs < gs), 0) AS away
            FROM games WHERE league = ?`, [no]);
        const scorers = await this.q<any>(`
            SELECT p.id, p.name, c.name AS club, s.goals, s.games
            FROM scorers s JOIN players p ON p.id = s.player JOIN clubs c ON c.id = s.club
            WHERE s.league = ? ORDER BY s.goals DESC LIMIT 5`, [no]);
        return {
            ...league,
            games: agg.games, goals: agg.goals, maxGoals: agg.maxGoals,
            avgGoals: agg.games ? round(agg.goals / agg.games) : 0,
            outcomes: { home: agg.home, draw: agg.draw, away: agg.away },
            scorers
        };
    }
}
