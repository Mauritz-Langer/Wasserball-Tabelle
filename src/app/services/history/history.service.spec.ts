import type { MockedObject } from "vitest";
import { TestBed } from '@angular/core/testing';
import { HistoryService } from './history.service';
import { DatabaseService } from '../database/database.service';

describe('HistoryService', () => {
    describe('isHistoricalGameId', () => {
        it('matches 3- and 4-segment numeric ids', () => {
            expect(HistoryService.isHistoricalGameId('2014_6_2')).toBe(true);
            expect(HistoryService.isHistoricalGameId('2018_128_1_1')).toBe(true);
            // groups with letters and separated rounds (Vorrunde/Playoffs)
            expect(HistoryService.isHistoricalGameId('2023_297_A_5')).toBe(true);
            expect(HistoryService.isHistoricalGameId('2025_298_P_12')).toBe(true);
            expect(HistoryService.isHistoricalGameId('2023_297_A_P_3')).toBe(true);
        });

        it('recognises archive league ids', () => {
            expect(HistoryService.isHistoricalLeagueId('2023_302')).toBe(true);
            expect(HistoryService.isHistoricalLeagueId('2023_297_A')).toBe(true);
            expect(HistoryService.isHistoricalLeagueId('League.aspx?Season=2026&LeagueID=1')).toBe(false);
            expect(HistoryService.isHistoricalLeagueId(null)).toBe(false);
        });

        it('rejects live DSV links and junk', () => {
            expect(HistoryService.isHistoricalGameId('Game.aspx?Season=2014&GameID=2')).toBe(false);
            expect(HistoryService.isHistoricalGameId('abc')).toBe(false);
            expect(HistoryService.isHistoricalGameId('20_6_2')).toBe(false);
            expect(HistoryService.isHistoricalGameId('2014_6')).toBe(false); // a league, not a game
            expect(HistoryService.isHistoricalGameId('Game.aspx?Season=2023&LeagueID=297&GameID=5')).toBe(false);
        });
    });

    describe('getGameDetails', () => {
        let dbSpy: MockedObject<DatabaseService>;
        let service: HistoryService;

        beforeEach(() => {
            dbSpy = {
                query: vi.fn().mockName("DatabaseService.query"),
                getOne: vi.fn().mockName("DatabaseService.getOne")
            } as unknown as MockedObject<DatabaseService>;
            TestBed.configureTestingModule({
                providers: [
                    HistoryService,
                    { provide: DatabaseService, useValue: dbSpy }
                ]
            });
            service = TestBed.inject(HistoryService);
        });

        it('returns null when the game is unknown', async () => {
            dbSpy.getOne.mockResolvedValue(undefined);
            const result = await service.getGameDetails('2014_6_2');
            expect(result).toBeNull();
        });

        it('assembles a GameDetails object from core + details queries', async () => {
            dbSpy.getOne.mockResolvedValue({
                id: '2014_6_2', league_id: '2014_6', start_time: '01.02.14, 18:00 Uhr',
                home_team: 'Team A', guest_team: 'Team B', final_score: '10:8',
                pool_name: 'Halle', pool_city: 'Berlin'
            });
            // getLeagueName -> getOne is also used; queue a second resolve.
            dbSpy.getOne.mockReturnValueOnce(Promise.resolve({ id: '2014_6_2', league_id: '2014_6', start_time: 's', home_team: 'Team A', guest_team: 'Team B', final_score: '10:8' })).mockReturnValueOnce(Promise.resolve({ name: 'Test Liga', season_id: '2014' }));
            dbSpy.query.mockImplementation(((file: string, sql: string): Promise<any[]> => {
                if (file === 'season-2014')
                    return Promise.resolve([]); // team image map
                expect(file).toBe('details-2014');
                if (sql.includes('game_quarter_scores'))
                    return Promise.resolve([{ quarter: 1, home_score: 3, guest_score: 2 }]);
                if (sql.includes('game_officials'))
                    return Promise.resolve([{ role: 'referee1', name: 'Schiri' }]);
                if (sql.includes('game_lineups'))
                    return Promise.resolve([{ team_side: 'home', number: '1', name: 'Spieler', birth_year: '2000', goals: 2, fouls_json: '[]' }]);
                if (sql.includes('game_events'))
                    return Promise.resolve([{ time: '7:12', period: 1, home_score: 1, guest_score: 0, player: 'Spieler', event_type: 'T', goal_number: 1, side: 'home', cap: '5' }]);
                return Promise.resolve([]);
            }) as any);

            const result = await service.getGameDetails('2014_6_2');
            expect(result).not.toBeNull();
            expect(result!.homeTeam.name).toBe('Team A');
            expect(result!.quarterScores.length).toBe(1);
            expect(result!.officials.referee1).toBe('Schiri');
            expect(result!.homeTeam.players?.length).toBe(1);
            expect(result!.events[0]).toEqual(expect.objectContaining({ side: 'home', cap: '5', eventType: 'T' }));
            expect(vi.mocked(dbSpy.getOne).mock.calls[0][0]).toBe('season-2014');
        });

        it('still returns the basics when the season has no detail file', async () => {
            dbSpy.getOne.mockReturnValueOnce(Promise.resolve({ id: '2011_1_1', league_id: '2011_1', start_time: 's', home_team: 'A', guest_team: 'B', final_score: '3:2' })).mockReturnValueOnce(Promise.resolve({ name: 'Alte Liga' }));
            dbSpy.query.mockImplementation(((file: string) => file.startsWith('details-') ? Promise.reject(new Error('404')) : Promise.resolve([])) as any);
            const result = await service.getGameDetails('2011_1_1');
            expect(result!.finalScore).toBe('3:2');
            expect(result!.events).toEqual([]);
            expect(result!.league).toBe('Alte Liga');
        });
    });
});
