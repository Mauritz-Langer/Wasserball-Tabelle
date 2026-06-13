import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { Item } from '../../models/item';
import { Games } from '../../models/games';
import { Table } from '../../models/table';
import { Scorer } from '../../models/scorer';
import { GameDetails } from '../../models/game-details';

@Injectable({
    providedIn: 'root'
})
export class HistoryService {
    private db = inject(DatabaseService);

    async getOverviewItems(seasonId: string): Promise<Item[]> {
        // Fetch all leagues for the season
        const leagues = await this.db.query(`
      SELECT id, name, link_url FROM leagues 
      WHERE season_id = ?
    `, [seasonId]);

        if (leagues.length === 0) return [];

        // Grouping logic: Since we didn't store categories (like 'National', 'Baden' etc.) in the DB explicitly 
        // during the scrape (extracted from flat list), we will bundle them for now.
        // TODO: Improve scraper to store categories.

        // Check if we can guess category from name? Not reliably.
        // We return one big "Historie" Item for now.

        const subItems = leagues.map(l => ({
            name: l.name,
            link: l.id, // We use the ID as the link for internal routing
            gender: '', // We didn't store gender explicitly either perfectly, could try to parse from name
            isFavorite: false
        }));

        return [{
            name: `Saison ${seasonId}`,
            subItems: subItems
        }];
    }

    async getGames(leagueId: string): Promise<Games[]> {
        const rows = await this.db.query(`
      SELECT * FROM games WHERE league_id = ? ORDER BY start_time
    `, [leagueId]);

        return rows.map(r => ({
            start: r.start_time,
            home: r.home_team,
            homeImageUrl: '', // We didn't store image URLs in games table, only in table_entries? Or separate? 
            // The scraper logic had images. Let's check `games` in schema.
            // Schema: id, league_id, start_time, home_team... no image column. 
            // Images were in `table_entries`. We can join or just omit for now.
            guest: r.guest_team,
            guestImageUrl: '',
            location: r.location,
            gameLink: r.id, // Use ID for link
            result: r.result
        }));
    }

    async getTable(leagueId: string): Promise<Table[]> {
        const rows = await this.db.query(`
      SELECT * FROM table_entries WHERE league_id = ? ORDER BY place
    `, [leagueId]);

        return rows.map(r => ({
            place: r.place,
            team: r.team,
            info: r.info || '',
            imageUrl: r.image_url || '',
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
        const rows = await this.db.query(`
      SELECT * FROM scorers WHERE league_id = ? ORDER BY place
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
}
