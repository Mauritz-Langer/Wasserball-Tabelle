import { Injectable, inject } from '@angular/core';
import { DatabaseService, seasonDb, detailsDb, logoUrl } from '../database/database.service';
import { Item } from '../../models/item';
import { Games } from '../../models/games';
import { Table } from '../../models/table';
import { Scorer } from '../../models/scorer';
import { GameDetails, TeamDetails, Officials, PersonalFoul } from '../../models/game-details';

@Injectable({
    providedIn: 'root'
})
export class HistoryService {
    private db = inject(DatabaseService);

    /** Archive ids start with the season: "2014_6" (league), "2014_6_2" (game). */
    private seasonOf(id: string): string {
        return String(id).slice(0, 4);
    }

    /**
     * Infer category from league name for grouping in overview.
     */
    private inferCategory(leagueName: string): string {
        const name = leagueName.toLowerCase();

        // National level
        if (name.includes('bundesliga') || name.includes('pokal') || name.includes('dsv')
            || name.includes('national') || name.includes('playoff')) {
            return 'National';
        }

        // Youth
        if (name.includes('jugend') || name.match(/u\s?\d{2}/) || name.includes('nachwuchs')
            || name.includes('mädchen') || name.includes('knaben') || name.includes('mini')) {
            return 'Jugend';
        }

        // Regional associations – check from most specific to least
        const regions: [string[], string][] = [
            [['baden'], 'Baden'],
            [['bayern', 'bayer'], 'Bayern'],
            [['berlin'], 'Berlin'],
            [['brandenburg'], 'Brandenburg'],
            [['bremen'], 'Bremen'],
            [['hamburg'], 'Hamburg'],
            [['hessen'], 'Hessen'],
            [['mecklenburg', 'meck'], 'Mecklenburg-Vorpommern'],
            [['niedersachsen', 'niedersächs'], 'Niedersachsen'],
            [['nordrhein', 'nrw', 'westfalen'], 'Nordrhein-Westfalen'],
            [['pfalz', 'rheinl'], 'Rheinland-Pfalz'],
            [['saarland'], 'Saarland'],
            [['sachsen-anhalt'], 'Sachsen-Anhalt'],
            [['sachsen'], 'Sachsen'],
            [['schleswig', 'holstein'], 'Schleswig-Holstein'],
            [['thüringen', 'thuring'], 'Thüringen'],
            [['württemberg'], 'Württemberg'],
            [['schwaben'], 'Schwaben'],
            [['westdeutsch'], 'Westdeutschland'],
            [['norddeutsch', 'nord'], 'Norddeutschland'],
            [['süddeutsch', 'süd'], 'Süddeutschland'],
            [['ostdeutsch', 'ost'], 'Ostdeutschland'],
        ];

        for (const [keywords, region] of regions) {
            if (keywords.some(kw => name.includes(kw))) {
                return region;
            }
        }

        // Oberliga / Verbandsliga / Bezirksliga without region
        if (name.includes('oberliga')) return 'Oberliga';
        if (name.includes('verbandsliga')) return 'Verbandsliga';
        if (name.includes('bezirk')) return 'Bezirksliga';

        return 'Sonstige';
    }

    async getOverviewItems(seasonId: string): Promise<Item[]> {
        const leagues = await this.db.query(seasonDb(seasonId), `
            SELECT id, name FROM leagues
            WHERE season_id = ?
            ORDER BY name
        `, [seasonId]);

        if (leagues.length === 0) return [];

        // Group leagues into categories
        const categoryMap = new Map<string, { name: string; link: string; gender: string; isFavorite: boolean }[]>();

        for (const l of leagues) {
            const category = this.inferCategory(l.name);
            if (!categoryMap.has(category)) {
                categoryMap.set(category, []);
            }

            // Try to extract gender from name
            const nameLower = l.name.toLowerCase();
            let gender = '';
            if (nameLower.includes('frauen') || nameLower.includes('damen') || nameLower.includes('weiblich') || nameLower.includes('mädchen')) {
                gender = 'Frauen';
            } else if (nameLower.includes('männer') || nameLower.includes('herren') || nameLower.includes('männlich') || nameLower.includes('knaben')) {
                gender = 'Männer';
            } else if (nameLower.includes('mixed') || nameLower.includes('gemischt')) {
                gender = 'Mixed';
            }

            categoryMap.get(category)!.push({
                name: l.name,
                link: l.id,
                gender: gender,
                isFavorite: false
            });
        }

        // Sort categories: National first, then alphabetically
        const sortOrder = ['National', 'Jugend'];
        const items: Item[] = [];

        // First add prioritized categories
        for (const priority of sortOrder) {
            if (categoryMap.has(priority)) {
                items.push({
                    name: priority,
                    subItems: categoryMap.get(priority)!
                });
                categoryMap.delete(priority);
            }
        }

        // Then add remaining categories alphabetically
        const remainingKeys = Array.from(categoryMap.keys()).sort();
        for (const key of remainingKeys) {
            items.push({
                name: key,
                subItems: categoryMap.get(key)!
            });
        }

        return items;
    }

    /**
     * Get the real league name from the database.
     */
    async getLeagueName(leagueId: string): Promise<string> {
        const row = await this.db.getOne(
            seasonDb(this.seasonOf(leagueId)),
            `SELECT name FROM leagues WHERE id = ?`,
            [leagueId]
        );
        return row?.name ?? 'Historische Liga';
    }

    /**
     * Build a team image map from table_entries for a given league.
     */
    private async getTeamImageMap(leagueId: string): Promise<Map<string, string>> {
        const teamImages = new Map<string, string>();
        // Logos are static image files, referenced by hash: the browser loads
        // (and caches) only the ones that are actually shown.
        const entries = await this.db.query(
            seasonDb(this.seasonOf(leagueId)),
            `SELECT team, logo_hash FROM table_entries WHERE league_id = ? AND logo_hash IS NOT NULL`,
            [leagueId]
        );
        for (const entry of entries) {
            teamImages.set(entry.team, logoUrl(entry.logo_hash));
        }
        return teamImages;
    }

    async getGames(leagueId: string): Promise<Games[]> {
        const [rows, teamImages] = await Promise.all([
            this.db.query(seasonDb(this.seasonOf(leagueId)), `
                SELECT * FROM games WHERE league_id = ?
            `, [leagueId]),
            this.getTeamImageMap(leagueId)
        ]);

        return rows.map(r => ({
            start: r.start_time,
            home: r.home_team,
            homeImageUrl: teamImages.get(r.home_team) || '',
            guest: r.guest_team,
            guestImageUrl: teamImages.get(r.guest_team) || '',
            location: r.location || '',
            gameLink: r.id,
            result: r.result || ' - '
        }));
    }

    async getTable(leagueId: string): Promise<Table[]> {
        const rows = await this.db.query(seasonDb(this.seasonOf(leagueId)), `
      SELECT * FROM table_entries WHERE league_id = ? ORDER BY seq
    `, [leagueId]);

        return rows.map(r => ({
            place: r.place,
            team: r.team,
            info: r.info || '',
            imageUrl: logoUrl(r.logo_hash),
            games: r.games_played,
            wins: r.wins,
            draws: r.draws,
            losses: r.losses,
            goals: r.goals,
            goalDifference: r.goal_diff,
            points: r.points
        }));
    }

    async getScorer(leagueId: string): Promise<Scorer[]> {
        const rows = await this.db.query(seasonDb(this.seasonOf(leagueId)), `
      SELECT * FROM scorers WHERE league_id = ? ORDER BY seq
    `, [leagueId]);

        return rows.map(r => ({
            place: r.place,
            name: r.name,
            team: r.team,
            birthYear: r.birth_year,
            goals: r.goals,
            games: r.games
        }));
    }

    /**
     * Historical game ids are numeric segments joined by underscores, e.g.
     * "2014_6_2" or "2018_128_1_1". Live DSV links look like "Game.aspx?…" and
     * never match this.
     */
    static isHistoricalLeagueId(id: string | null | undefined): boolean {
        return !!id && /^\d{4}_\w+$/.test(id);
    }

    /**
     * Archive game ids: season, LeagueID, optional group and round, game number,
     * e.g. "2014_6_2", "2023_297_A_5" or "2025_298_P_12". DSV links
     * ("Game.aspx?…") never match.
     */
    static isHistoricalGameId(id: string): boolean {
        return /^\d{4}_\d+(_[A-Za-z0-9]+)*_\d+$/.test(id);
    }

    /**
     * Reconstruct a full GameDetails object from the database for a historical
     * game. Mirrors the structure produced by the live HTML parser so the
     * game-details component can render archive games identically.
     */
    async getGameDetails(gameId: string): Promise<GameDetails | null> {
        const season = this.seasonOf(gameId);
        // Some seasons have no detail file (nothing recorded): the report then shows the basics.
        const detail = (sql: string) => this.db.query(detailsDb(season), sql, [gameId]).catch(() => [] as any[]);
        const game = await this.db.getOne(seasonDb(season), `SELECT * FROM games WHERE id = ?`, [gameId]);
        if (!game) return null;

        // Per-game detail tables live in the season's details file, which is
        // only downloaded now; core fields come from the season file.
        const [leagueName, quarters, officialRows, eventRows, teamDetailRows, lineupRows, teamImages] =
            await Promise.all([
                this.getLeagueName(game.league_id),
                detail(`SELECT quarter, home_score, guest_score FROM game_quarter_scores WHERE game_id = ? ORDER BY quarter`),
                detail(`SELECT role, name FROM game_officials WHERE game_id = ?`),
                detail(`SELECT * FROM game_events WHERE game_id = ? ORDER BY seq`),
                detail(`SELECT * FROM game_team_details WHERE game_id = ?`),
                detail(`SELECT * FROM game_lineups WHERE game_id = ? ORDER BY CAST(number AS INTEGER), name`),
                this.getTeamImageMap(game.league_id)
            ]);

        const officials: Officials = {};
        for (const o of officialRows) {
            if (o.role && o.name) (officials as any)[o.role] = o.name;
        }

        const buildTeam = (side: 'home' | 'guest', name: string): TeamDetails => {
            const d = teamDetailRows.find(r => r.team_side === side) || {};
            return {
                name,
                logoUrl: teamImages.get(name) || '',
                coach: d.coach || undefined,
                captain: d.captain || undefined,
                teamLeader: d.team_leader || undefined,
                companionLeader: d.companion_leader || undefined,
                assistant: d.assistant || undefined,
                bestPlayer: d.best_player || undefined,
                players: lineupRows
                    .filter(l => l.team_side === side)
                    .map(l => ({
                        number: l.number || '',
                        name: l.name || '',
                        birthYear: l.birth_year || '',
                        goals: l.goals || 0,
                        fouls: this.parseFouls(l.fouls_json)
                    }))
            };
        };

        return {
            gameId,
            league: leagueName,
            startDate: game.start_time || '',
            playKind: game.play_kind || '',
            homeTeam: buildTeam('home', game.home_team),
            guestTeam: buildTeam('guest', game.guest_team),
            finalScore: game.final_score || game.result || '',
            scoringSystem: game.scoring_system || undefined,
            quarterScores: quarters.map(q => ({ quarter: q.quarter, home: q.home_score, guest: q.guest_score })),
            venue: {
                poolName: game.pool_name || '',
                poolCity: game.pool_city || '',
                googleMapsLink: game.google_maps_link || ''
            },
            officials,
            events: eventRows.map(e => ({
                time: e.time || '',
                period: e.period || 0,
                homeScore: e.home_score ?? 0,
                guestScore: e.guest_score ?? 0,
                player: e.player || '',
                eventType: e.event_type || '',
                goalNumber: e.goal_number ?? undefined,
                // Only in data from the liveticker (update-archive.js --via-ticker).
                side: e.side === 'home' || e.side === 'guest' ? e.side : undefined,
                cap: e.cap || undefined
            })),
            notes: game.notes || undefined,
            videoLink: game.video_link || undefined,
            protocolLink: game.protocol_link || undefined,
            endGameTime: game.end_time || undefined,
            organizer: game.organizer || undefined
        };
    }

    private parseFouls(json: string): PersonalFoul[] {
        if (!json) return [];
        try {
            const parsed = JSON.parse(json);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
}
