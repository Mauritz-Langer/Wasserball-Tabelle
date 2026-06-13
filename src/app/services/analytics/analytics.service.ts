import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../database/database.service';

export interface TeamStat {
    name: string;
    games: number;
    winRate: number;
    avgScored: number;
    avgConceded: number;
}

export interface SeasonTrend {
    season_id: string;
    avgGoals: number;
    games: number;
}

export interface HomeAdvantage {
    result: 'Heimsieg' | 'Auswärtssieg' | 'Unentschieden';
    count: number;
}

export interface Entity {
    id: string;
    name: string;
}

export interface PlayerStat {
    season: string;
    goals: number;
    games: number;
}

export interface LeagueStat {
    name: string;
    avgGoals: number;
    games: number;
}

export interface GameRecord {
    date: string;
    home: string;
    guest: string;
    score: string;
    totalGoals: number;
    league: string;
}

export interface SeasonGrowth {
    season: string;
    games: number;
    leagues: number;
}

export interface TeamForm {
    result: 'W' | 'L' | 'D';
    date: string;
    opponent: string;
    score: string;
}

export interface Rivalry {
    opponent: string;
    matches: number;
    wins: number;
    draws: number;
    losses: number;
}

export interface TopScorer {
    name: string;
    totalGoals: number;
    games: number;
    seasons: number;
    avg: number;
}

export interface Streak {
    team: string;
    count: number;
}

export interface BiggestWin {
    date: string;
    opponent: string;
    diff: number;
    score: string;
}

export interface Journeyman {
    name: string;
    clubs: number;
    teams_list: string;
}

export interface LeagueCompetitiveness {
    name: string;
    avgDiff: number;
    games: number;
}

// --- LEAGUE ANALYSIS ---

export interface LeagueComparison {
    level: string;
    avgGoals: number;
    games: number;
}

export interface SeasonalPattern {
    month: number;
    avgGoals: number;
    games: number;
}

export interface TotalStats {
    totalGames: number;
    totalTeams: number;
    totalGoals: number;
    seasonsCount: number;
}

export interface GoalDistribution {
    bucket: string;
    count: number;
}

export interface TeamSeasonGoals {
    season: string;
    scored: number;
    conceded: number;
    games: number;
}

@Injectable({
    providedIn: 'root'
})
export class AnalyticsService {
    private db = inject(DatabaseService);

    // --- SEASONS ---

    async getAllSeasons(): Promise<string[]> {
        await this.db.ensureDbLoaded();
        const query = `SELECT DISTINCT season_id FROM leagues ORDER BY season_id DESC`;
        const res = await this.db.query(query);
        return res.map((r: any) => r.season_id);
    }

    // --- KPI / OVERVIEW STATS ---

    /** Builds a SQL clause + params for optional season filtering via leagues table */
    private seasonFilter(seasonId: string | undefined, leagueAlias = 'l'): { clause: string, params: any[] } {
        if (!seasonId) return { clause: '', params: [] };
        return { clause: ` AND ${leagueAlias}.season_id = ?`, params: [seasonId] };
    }

    /** Builds a season filter for queries that JOIN games->leagues */
    private seasonFilterGames(seasonId: string | undefined): { join: string, clause: string, params: any[] } {
        if (!seasonId) return { join: '', clause: '', params: [] };
        return {
            join: '',  // assume leagues join already exists
            clause: ` AND l.season_id = ?`,
            params: [seasonId]
        };
    }

    async getTotalStats(seasonId?: string): Promise<TotalStats> {
        await this.db.ensureDbLoaded();
        if (seasonId) {
            const query = `
                SELECT
                    COUNT(*) as totalGames,
                    COUNT(DISTINCT CASE WHEN g.home_team_id IS NOT NULL THEN g.home_team_id END) +
                    COUNT(DISTINCT CASE WHEN g.guest_team_id IS NOT NULL THEN g.guest_team_id END) as totalTeams,
                    COALESCE(SUM(g.total_goals), 0) as totalGoals,
                    1 as seasonsCount
                FROM games g
                JOIN leagues l ON g.league_id = l.id
                WHERE g.home_score IS NOT NULL AND l.season_id = ?
            `;
            const res = await this.db.query(query, [seasonId]);
            return res[0] || { totalGames: 0, totalTeams: 0, totalGoals: 0, seasonsCount: 1 };
        }
        const query = `
            SELECT
                COUNT(*) as totalGames,
                (SELECT COUNT(*) FROM teams) as totalTeams,
                COALESCE(SUM(total_goals), 0) as totalGoals,
                (SELECT COUNT(DISTINCT season_id) FROM leagues) as seasonsCount
            FROM games
            WHERE home_score IS NOT NULL
        `;
        const res = await this.db.query(query);
        return res[0] || { totalGames: 0, totalTeams: 0, totalGoals: 0, seasonsCount: 0 };
    }

    async getGoalDistribution(seasonId?: string): Promise<GoalDistribution[]> {
        await this.db.ensureDbLoaded();
        const sf = this.seasonFilter(seasonId);
        const query = `
            SELECT
                CASE
                    WHEN g.total_goals BETWEEN 0 AND 5 THEN '0–5'
                    WHEN g.total_goals BETWEEN 6 AND 10 THEN '6–10'
                    WHEN g.total_goals BETWEEN 11 AND 15 THEN '11–15'
                    WHEN g.total_goals BETWEEN 16 AND 20 THEN '16–20'
                    WHEN g.total_goals BETWEEN 21 AND 25 THEN '21–25'
                    WHEN g.total_goals BETWEEN 26 AND 30 THEN '26–30'
                    ELSE '31+'
                END as bucket,
                COUNT(*) as count
            FROM games g
            ${seasonId ? 'JOIN leagues l ON g.league_id = l.id' : ''}
            WHERE g.total_goals IS NOT NULL${sf.clause}
            GROUP BY bucket
            ORDER BY MIN(g.total_goals)
        `;
        return await this.db.query(query, sf.params);
    }

    async getTeamGoalsPerSeason(teamId: string): Promise<TeamSeasonGoals[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                SUBSTR(l.season_id, 1, 4) as season,
                SUM(CASE WHEN g.home_team_id = ? THEN g.home_score ELSE g.guest_score END) as scored,
                SUM(CASE WHEN g.home_team_id = ? THEN g.guest_score ELSE g.home_score END) as conceded,
                COUNT(*) as games
            FROM games g
            JOIN leagues l ON g.league_id = l.id
            WHERE (g.home_team_id = ? OR g.guest_team_id = ?)
              AND g.home_score IS NOT NULL
            GROUP BY season
            ORDER BY season
        `;
        return await this.db.query(query, [teamId, teamId, teamId, teamId]);
    }

    // --- DEEP DIVE ANALYTICS ---

    // 1. Team Home/Away Split
    async getTeamHomeAwayStats(teamId: string, seasonId?: string): Promise<{ home: { w: number, d: number, l: number }, away: { w: number, d: number, l: number } }> {
        await this.db.ensureDbLoaded();
        const sf = this.seasonFilter(seasonId);
        const query = `
            SELECT
                CASE WHEN g.home_team_id = ? THEN 'HOME' ELSE 'AWAY' END as type,
                SUM(CASE
                    WHEN (g.home_team_id = ? AND g.home_score > g.guest_score) OR (g.guest_team_id = ? AND g.guest_score > g.home_score) THEN 1
                    ELSE 0 END) as wins,
                SUM(CASE WHEN g.home_score = g.guest_score THEN 1 ELSE 0 END) as draws,
                SUM(CASE
                    WHEN (g.home_team_id = ? AND g.home_score < g.guest_score) OR (g.guest_team_id = ? AND g.guest_score < g.home_score) THEN 1
                    ELSE 0 END) as losses
            FROM games g
            JOIN leagues l ON g.league_id = l.id
            WHERE (g.home_team_id = ? OR g.guest_team_id = ?) AND g.home_score IS NOT NULL${sf.clause}
            GROUP BY type
        `;
        const res = await this.db.query(query, [teamId, teamId, teamId, teamId, teamId, teamId, teamId, ...sf.params]);

        const home = res.find(r => r.type === 'HOME') || { wins: 0, draws: 0, losses: 0 };
        const away = res.find(r => r.type === 'AWAY') || { wins: 0, draws: 0, losses: 0 };

        return {
            home: { w: home.wins, d: home.draws, l: home.losses },
            away: { w: away.wins, d: away.draws, l: away.losses }
        };
    }

    // 2. Defensive Grit (Clean Sheets)
    async getTeamCleanSheets(teamId: string, seasonId?: string): Promise<number> {
        await this.db.ensureDbLoaded();
        const sf = this.seasonFilter(seasonId);
        const query = `
            SELECT COUNT(*) as count
            FROM games g
            JOIN leagues l ON g.league_id = l.id
            WHERE ((g.home_team_id = ? AND g.guest_score = 0) OR (g.guest_team_id = ? AND g.home_score = 0))
              AND g.home_score IS NOT NULL${sf.clause}
        `;
        const res = await this.db.query(query, [teamId, teamId, ...sf.params]);
        return res[0]?.count || 0;
    }

    // 3. Offensive Struggles (Failed to Score)
    async getTeamScoringFailures(teamId: string, seasonId?: string): Promise<number> {
        await this.db.ensureDbLoaded();
        const sf = this.seasonFilter(seasonId);
        const query = `
            SELECT COUNT(*) as count
            FROM games g
            JOIN leagues l ON g.league_id = l.id
            WHERE ((g.home_team_id = ? AND g.home_score = 0) OR (g.guest_team_id = ? AND g.guest_score = 0))
              AND g.home_score IS NOT NULL${sf.clause}
        `;
        const res = await this.db.query(query, [teamId, teamId, ...sf.params]);
        return res[0]?.count || 0;
    }

    // 4. Player Efficiency (Goals per Game)
    async getPlayerEfficiency(playerId: string): Promise<{ season: string, avg: number }[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                SUBSTR(league_id, 1, 4) as season,
                ROUND(1.0 * SUM(goals) / SUM(games), 2) as avg
            FROM scorers
            WHERE player_id = ? AND games > 0
            GROUP BY season
            ORDER BY season
        `;
        return await this.db.query(query, [playerId]);
    }

    // 5. Career Path
    async getPlayerTeams(playerId: string): Promise<{ season: string, team: string, league: string }[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                SUBSTR(s.league_id, 1, 4) as season,
                s.team,
                l.name as league
            FROM scorers s
            JOIN leagues l ON s.league_id = l.id
            WHERE s.player_id = ?
            ORDER BY season DESC
        `;
        return await this.db.query(query, [playerId]);
    }

    // ... existing ...

    async getLeagueComparison(): Promise<LeagueComparison[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                CASE
                    WHEN l.name LIKE '%Bundesliga%' THEN 'Bundesliga'
                    WHEN l.name LIKE '%Oberliga%' THEN 'Oberliga'
                    WHEN l.name LIKE '%Verbandsliga%' THEN 'Verbandsliga'
                    WHEN l.name LIKE '%Bezirk%' THEN 'Bezirksliga'
                    WHEN l.name LIKE '%U1%' OR l.name LIKE '%U2%' THEN 'Jugend'
                    ELSE 'Sonstige'
                END as level,
                ROUND(AVG(g.total_goals), 2) as avgGoals,
                COUNT(*) as games
            FROM leagues l
            JOIN games g ON g.league_id = l.id
            WHERE g.total_goals IS NOT NULL
            GROUP BY level
            ORDER BY avgGoals DESC
        `;
        return await this.db.query(query);
    }

    async getSeasonalPatterns(): Promise<SeasonalPattern[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                 CAST(strftime('%m', g.date_iso) AS INTEGER) as month,
                 ROUND(AVG(g.total_goals), 2) as avgGoals,
                 COUNT(*) as games
            FROM games g
            WHERE g.date_iso IS NOT NULL AND g.total_goals IS NOT NULL
            GROUP BY month
            ORDER BY month
        `;
        return await this.db.query(query);
    }


    // ... existing methods ...

    // --- TEAM ANALYSIS ---

    async getTeamForm(teamId: string, limit: number = 10): Promise<TeamForm[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                g.date_iso as date,
                CASE
                    WHEN g.home_team_id = ? THEN tGuest.name
                    ELSE tHome.name
                END as opponent,
                CASE
                    WHEN (g.home_team_id = ? AND g.home_score > g.guest_score) OR (g.guest_team_id = ? AND g.guest_score > g.home_score) THEN 'W'
                    WHEN g.home_score = g.guest_score THEN 'D'
                    ELSE 'L'
                END as result,
                g.home_score || ':' || g.guest_score as score
            FROM games g
            JOIN teams tHome ON g.home_team_id = tHome.id
            JOIN teams tGuest ON g.guest_team_id = tGuest.id
            WHERE (g.home_team_id = ? OR g.guest_team_id = ?)
              AND g.home_score IS NOT NULL
            ORDER BY g.date_iso DESC
            LIMIT ?
        `;
        return await this.db.query(query, [teamId, teamId, teamId, teamId, teamId, limit]);
    }

    async getTeamRivals(teamId: string, limit: number = 5): Promise<Rivalry[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                CASE
                    WHEN g.home_team_id = ? THEN tGuest.name
                    ELSE tHome.name
                END as opponent,
                COUNT(*) as matches,
                SUM(CASE
                    WHEN (g.home_team_id = ? AND g.home_score > g.guest_score) OR (g.guest_team_id = ? AND g.guest_score > g.home_score) THEN 1
                    ELSE 0
                END) as wins,
                SUM(CASE WHEN g.home_score = g.guest_score THEN 1 ELSE 0 END) as draws,
                SUM(CASE
                    WHEN (g.home_team_id = ? AND g.home_score < g.guest_score) OR (g.guest_team_id = ? AND g.guest_score < g.home_score) THEN 1
                    ELSE 0
                END) as losses
            FROM games g
            JOIN teams tHome ON g.home_team_id = tHome.id
            JOIN teams tGuest ON g.guest_team_id = tGuest.id
            WHERE (g.home_team_id = ? OR g.guest_team_id = ?)
              AND g.home_score IS NOT NULL
            GROUP BY opponent
            ORDER BY matches DESC
            LIMIT ?
        `;
        // Parameters mapping is tricky here because of multiple usages.
        // We need: teamId (x1 for Select), teamId (x2 for Win), teamId (x2 for Loss), teamId (x2 for Where)
        // Total 7 placeholders? No, sqlite usage above:
        // 1. Select Opponent: teamId
        // 2. Win Check: teamId, teamId
        // 3. Loss Check: teamId, teamId
        // 4. Where Clause: teamId, teamId
        return await this.db.query(query, [teamId, teamId, teamId, teamId, teamId, teamId, teamId, limit]);
    }

    async getTeamOffenseDefense(teamId: string): Promise<{ avgScored: number, avgConceded: number }> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                ROUND(AVG(CASE WHEN g.home_team_id = ? THEN g.home_score ELSE g.guest_score END), 2) as avgScored,
                ROUND(AVG(CASE WHEN g.home_team_id = ? THEN g.guest_score ELSE g.home_score END), 2) as avgConceded
            FROM games g
            WHERE (g.home_team_id = ? OR g.guest_team_id = ?)
              AND g.home_score IS NOT NULL
        `;
        const res = await this.db.query(query, [teamId, teamId, teamId, teamId]);
        return res[0] || { avgScored: 0, avgConceded: 0 };
    }

    // --- PLAYER ANALYSIS ---

    async getTopScorersAllTime(limit: number = 20): Promise<TopScorer[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                p.name,
                SUM(s.goals) as totalGoals,
                SUM(s.games) as games,
                COUNT(DISTINCT s.league_id) as seasons,
                ROUND(1.0 * SUM(s.goals) / SUM(s.games), 2) as avg
            FROM scorers s
            JOIN players p ON s.player_id = p.id
            GROUP BY p.id
            HAVING games >= 10
            ORDER BY totalGoals DESC
            LIMIT ?
        `;
        return await this.db.query(query, [limit]);
    }


    // --- ADVANCED ANALYSIS ---

    async getWinningStreaks(limit: number = 5): Promise<Streak[]> {
        await this.db.ensureDbLoaded();
        // Complex query for streaks. limiting complexity by doing in-memory processing if needed,
        // but let's try a window function approach supported by SQLite
        const query = `
            WITH MatchResults AS (
                SELECT
                    g.date_iso,
                    t.name as team_name,
                    t.id as team_id,
                    CASE
                        WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score) OR
                             (g.guest_team_id = t.id AND g.guest_score > g.home_score)
                        THEN 1 ELSE 0
                    END as won
                FROM games g
                JOIN teams t ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
                WHERE g.home_score IS NOT NULL
                ORDER BY g.date_iso
            ),
            StreakGroups AS (
                SELECT
                    team_name,
                    won,
                    ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY date_iso) -
                    ROW_NUMBER() OVER (PARTITION BY team_id, won ORDER BY date_iso) as grp
                FROM MatchResults
            )
            SELECT
                team_name as team,
                COUNT(*) as count
            FROM StreakGroups
            WHERE won = 1
            GROUP BY team_name, grp
            ORDER BY count DESC
            LIMIT ?
        `;
        return await this.db.query(query, [limit]);
    }

    async getTeamBiggestWins(teamId: string, limit: number = 5): Promise<BiggestWin[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                g.date_iso as date,
                CASE WHEN g.home_team_id = ? THEN tGuest.name ELSE tHome.name END as opponent,
                ABS(g.home_score - g.guest_score) as diff,
                g.home_score || ':' || g.guest_score as score
            FROM games g
            JOIN teams tHome ON g.home_team_id = tHome.id
            JOIN teams tGuest ON g.guest_team_id = tGuest.id
            WHERE (g.home_team_id = ? OR g.guest_team_id = ?)
              AND g.home_score IS NOT NULL
              AND (
                  (g.home_team_id = ? AND g.home_score > g.guest_score) OR
                  (g.guest_team_id = ? AND g.guest_score > g.home_score)
              )
            ORDER BY diff DESC
            LIMIT ?
        `;
        return await this.db.query(query, [teamId, teamId, teamId, teamId, teamId, limit]);
    }

    async getPlayerJourneymen(limit: number = 10): Promise<Journeyman[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                p.name,
                COUNT(DISTINCT s.team) as clubs,
                GROUP_CONCAT(DISTINCT s.team) as teams_list
            FROM scorers s
            JOIN players p ON s.player_id = p.id
            GROUP BY p.id
            HAVING clubs >= 3
            ORDER BY clubs DESC
            LIMIT ?
        `;
        return await this.db.query(query, [limit]);
    }

    async getYoungTalents(limit: number = 10): Promise<TopScorer[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                p.name,
                SUM(s.goals) as totalGoals,
                SUM(s.games) as games,
                COUNT(DISTINCT s.league_id) as seasons,
                ROUND(1.0 * SUM(s.goals) / SUM(s.games), 2) as avg
            FROM scorers s
            JOIN players p ON s.player_id = p.id
            WHERE p.birth_year >= 2005
            GROUP BY p.id
            HAVING totalGoals >= 10
            ORDER BY totalGoals DESC
            LIMIT ?
        `;
        return await this.db.query(query, [limit]);
    }

    /** Leagues with the smallest average goal difference (closest contests). */
    async getTightestLeagues(limit: number = 10): Promise<LeagueCompetitiveness[]> {
        await this.db.ensureDbLoaded();
        const query = `
             SELECT
                l.name,
                ROUND(AVG(ABS(g.home_score - g.guest_score)), 2) as avgDiff,
                COUNT(*) as games
             FROM leagues l
             JOIN games g ON g.league_id = l.id
             WHERE g.total_goals IS NOT NULL
             GROUP BY l.id
             HAVING games >= 20
             ORDER BY avgDiff ASC
             LIMIT ?
        `;
        return await this.db.query(query, [limit]);
    }

    // --- PHASE 3: EXPANDED ANALYSIS ---

    async getTeamFavoriteOpponents(teamId: string): Promise<{ favorite: { name: string, count: number }, nightmare: { name: string, count: number } }> {
        await this.db.ensureDbLoaded();

        // 1. Favorite (Most Wins)
        const favQuery = `
            SELECT
                CASE WHEN home_team_id = ? THEN tGuest.name ELSE tHome.name END as opponent,
                COUNT(*) as wins
            FROM games g
            JOIN teams tHome ON g.home_team_id = tHome.id
            JOIN teams tGuest ON g.guest_team_id = tGuest.id
            WHERE ((home_team_id = ? AND home_score > guest_score) OR (guest_team_id = ? AND guest_score > home_score))
            GROUP BY opponent
            ORDER BY wins DESC
            LIMIT 1
        `;
        const favRes = await this.db.query(favQuery, [teamId, teamId, teamId]);

        // 2. Nightmare (Most Losses)
        const nightQuery = `
            SELECT
                CASE WHEN home_team_id = ? THEN tGuest.name ELSE tHome.name END as opponent,
                COUNT(*) as losses
            FROM games g
            JOIN teams tHome ON g.home_team_id = tHome.id
            JOIN teams tGuest ON g.guest_team_id = tGuest.id
            WHERE ((home_team_id = ? AND home_score < guest_score) OR (guest_team_id = ? AND guest_score < home_score))
            GROUP BY opponent
            ORDER BY losses DESC
            LIMIT 1
        `;
        const nightRes = await this.db.query(nightQuery, [teamId, teamId, teamId]);

        return {
            favorite: favRes.length ? { name: favRes[0].opponent, count: favRes[0].wins } : { name: '-', count: 0 },
            nightmare: nightRes.length ? { name: nightRes[0].opponent, count: nightRes[0].losses } : { name: '-', count: 0 }
        };
    }

    /**
     * The player's best scoring season. (A true "favorite opponent" is not
     * possible: the scorers table is aggregated per season, not per match.)
     */
    async getPlayerPersonalBest(playerId: string): Promise<{ opponent: string, goals: number }> {
        await this.db.ensureDbLoaded();
        const pbQuery = `
            SELECT
                SUBSTR(league_id, 1, 4) as season,
                goals,
                team
            FROM scorers
            WHERE player_id = ?
            ORDER BY goals DESC
            LIMIT 1
        `;
        const res = await this.db.query(pbQuery, [playerId]);
        return res.length ? { opponent: `${res[0].season} (${res[0].team})`, goals: res[0].goals } : { opponent: '-', goals: 0 };
    }

    async getLeagueDetails(leagueId: string): Promise<any> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                COUNT(*) as games,
                ROUND(AVG(total_goals), 2) as avgGoals,
                MAX(total_goals) as maxGoals,
                SUM(CASE WHEN home_score > guest_score THEN 1 ELSE 0 END) as homeWins,
                SUM(CASE WHEN home_score < guest_score THEN 1 ELSE 0 END) as awayWins,
                SUM(CASE WHEN home_score = guest_score THEN 1 ELSE 0 END) as draws
            FROM games
            WHERE league_id = ? AND total_goals IS NOT NULL
        `;
        const res = await this.db.query(query, [leagueId]);
        return res.length ? res[0] : null;
    }

    // --- OVERVIEW ANALYSIS ---

    async getHighestScoringGames(limit: number = 5, seasonId?: string): Promise<GameRecord[]> {
        await this.db.ensureDbLoaded();
        const sf = this.seasonFilter(seasonId);
        const query = `
            SELECT
                g.date_iso as date,
                t1.name as home,
                t2.name as guest,
                g.home_score || ':' || g.guest_score as score,
                g.total_goals as totalGoals,
                l.name as league
            FROM games g
            JOIN teams t1 ON g.home_team_id = t1.id
            JOIN teams t2 ON g.guest_team_id = t2.id
            JOIN leagues l ON g.league_id = l.id
            WHERE g.total_goals IS NOT NULL${sf.clause}
            ORDER BY g.total_goals DESC
            LIMIT ?
        `;
        return await this.db.query(query, [...sf.params, limit]);
    }

    async getSeasonGrowth(): Promise<SeasonGrowth[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                l.season_id as season,
                COUNT(*) as games,
                COUNT(DISTINCT l.id) as leagues
            FROM leagues l
            JOIN games g ON g.league_id = l.id
            GROUP BY season
            ORDER BY season
        `;
        return await this.db.query(query);
    }


    async getAllTeams(): Promise<Entity[]> {
        await this.db.ensureDbLoaded();
        const query = `SELECT id, name FROM teams ORDER BY name`;
        return await this.db.query(query);
    }

    async getAllPlayers(): Promise<Entity[]> {
        await this.db.ensureDbLoaded();
        const query = `SELECT id, name FROM players ORDER BY name`;
        return await this.db.query(query);
    }

    async getAllLeagues(): Promise<Entity[]> {
        await this.db.ensureDbLoaded();
        const query = `SELECT id, name FROM leagues ORDER BY name`;
        return await this.db.query(query);
    }

    async getTeamStatsHistory(teamId: string): Promise<any[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                SUBSTR(l.season_id, 1, 4) as season,
                COUNT(*) as games,
                SUM(CASE
                    WHEN (g.home_team_id = ? AND g.home_score > g.guest_score)
                      OR (g.guest_team_id = ? AND g.guest_score > g.home_score)
                    THEN 1 ELSE 0
                END) as wins,
                 ROUND(100.0 * SUM(CASE
                    WHEN (g.home_team_id = ? AND g.home_score > g.guest_score)
                      OR (g.guest_team_id = ? AND g.guest_score > g.home_score)
                    THEN 1 ELSE 0
                END) / COUNT(*), 1) as winRate
            FROM games g
            JOIN leagues l ON g.league_id = l.id
            WHERE (g.home_team_id = ? OR g.guest_team_id = ?)
              AND g.home_score IS NOT NULL
            GROUP BY season
            ORDER BY season
        `;
        return await this.db.query(query, [teamId, teamId, teamId, teamId, teamId, teamId]);
    }

    async getPlayerStatsHistory(playerId: string): Promise<PlayerStat[]> {
        await this.db.ensureDbLoaded();
        const query = `
            SELECT
                SUBSTR(s.league_id, 1, 4) as season,
                SUM(s.goals) as goals,
                SUM(s.games) as games
            FROM scorers s
            WHERE s.player_id = ?
            GROUP BY season
            ORDER BY season
        `;
        return await this.db.query(query, [playerId]);
    }

    async getTopTeams(limit: number = 20, seasonId?: string): Promise<TeamStat[]> {
        await this.db.ensureDbLoaded();
        const sf = this.seasonFilter(seasonId);

        const query = `
      SELECT
        t.name,
        COUNT(*) as games,
        ROUND(100.0 * SUM(CASE
          WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score)
            OR (g.guest_team_id = t.id AND g.guest_score > g.home_score)
          THEN 1 ELSE 0
        END) / COUNT(*), 1) as winRate,
        ROUND(AVG(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.guest_score END), 2) as avgScored,
        ROUND(AVG(CASE WHEN g.home_team_id = t.id THEN g.guest_score ELSE g.home_score END), 2) as avgConceded
      FROM teams t
      JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
      ${seasonId ? 'JOIN leagues l ON g.league_id = l.id' : ''}
      WHERE g.home_score IS NOT NULL${sf.clause}
      GROUP BY t.id
      HAVING games >= ${seasonId ? '5' : '20'}
      ORDER BY winRate DESC
      LIMIT ?
    `;

        return await this.db.query(query, [...sf.params, limit]);
    }

    async getTrendsOverTime(): Promise<SeasonTrend[]> {
        await this.db.ensureDbLoaded();

        const query = `
      SELECT
        l.season_id,
        ROUND(AVG(g.total_goals), 2) as avgGoals,
        COUNT(*) as games
      FROM leagues l
      JOIN games g ON g.league_id = l.id
      WHERE g.total_goals IS NOT NULL
      GROUP BY l.season_id
      ORDER BY l.season_id
    `;

        return await this.db.query(query);
    }

    async getHomeAdvantage(seasonId?: string): Promise<HomeAdvantage[]> {
        await this.db.ensureDbLoaded();
        const sf = this.seasonFilter(seasonId);

        const query = `
      SELECT
          CASE
              WHEN g.home_score > g.guest_score THEN 'Heimsieg'
              WHEN g.home_score < g.guest_score THEN 'Auswärtssieg'
              ELSE 'Unentschieden'
          END as result,
          COUNT(*) as count
      FROM games g
      ${seasonId ? 'JOIN leagues l ON g.league_id = l.id' : ''}
      WHERE g.home_score IS NOT NULL${sf.clause}
      GROUP BY result
    `;

        return await this.db.query(query, sf.params);
    }
}
