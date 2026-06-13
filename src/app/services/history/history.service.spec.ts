import { TestBed } from '@angular/core/testing';
import { HistoryService } from './history.service';
import { DatabaseService } from '../database/database.service';

describe('HistoryService', () => {
    describe('isHistoricalGameId', () => {
        it('matches 3- and 4-segment numeric ids', () => {
            expect(HistoryService.isHistoricalGameId('2014_6_2')).toBeTrue();
            expect(HistoryService.isHistoricalGameId('2018_128_1_1')).toBeTrue();
        });

        it('rejects live DSV links and junk', () => {
            expect(HistoryService.isHistoricalGameId('Game.aspx?Season=2014&GameID=2')).toBeFalse();
            expect(HistoryService.isHistoricalGameId('abc')).toBeFalse();
            expect(HistoryService.isHistoricalGameId('20_6_2')).toBeFalse();
        });
    });

    describe('getGameDetails', () => {
        let dbSpy: jasmine.SpyObj<DatabaseService>;
        let service: HistoryService;

        beforeEach(() => {
            dbSpy = jasmine.createSpyObj('DatabaseService', ['query', 'getOne', 'queryDetails']);
            TestBed.configureTestingModule({
                providers: [
                    HistoryService,
                    { provide: DatabaseService, useValue: dbSpy }
                ]
            });
            service = TestBed.inject(HistoryService);
        });

        it('returns null when the game is unknown', async () => {
            dbSpy.getOne.and.resolveTo(undefined);
            const result = await service.getGameDetails('2014_6_2');
            expect(result).toBeNull();
        });

        it('assembles a GameDetails object from core + details queries', async () => {
            dbSpy.getOne.and.resolveTo({
                id: '2014_6_2', league_id: '2014_6', start_time: '01.02.14, 18:00 Uhr',
                home_team: 'Team A', guest_team: 'Team B', final_score: '10:8',
                pool_name: 'Halle', pool_city: 'Berlin'
            });
            // getLeagueName -> getOne is also used; queue a second resolve.
            dbSpy.getOne.and.returnValues(
                Promise.resolve({ id: '2014_6_2', league_id: '2014_6', start_time: 's', home_team: 'Team A', guest_team: 'Team B', final_score: '10:8' }),
                Promise.resolve({ name: 'Test Liga', season_id: '2014' })
            );
            dbSpy.query.and.resolveTo([]); // team image map
            dbSpy.queryDetails.and.callFake((sql: string) => {
                if (sql.includes('game_quarter_scores')) return Promise.resolve([{ quarter: 1, home_score: 3, guest_score: 2 }]);
                if (sql.includes('game_officials')) return Promise.resolve([{ role: 'referee1', name: 'Schiri' }]);
                if (sql.includes('game_lineups')) return Promise.resolve([{ team_side: 'home', number: '1', name: 'Spieler', birth_year: '2000', goals: 2, fouls_json: '[]' }]);
                return Promise.resolve([]);
            });

            const result = await service.getGameDetails('2014_6_2');
            expect(result).not.toBeNull();
            expect(result!.homeTeam.name).toBe('Team A');
            expect(result!.quarterScores.length).toBe(1);
            expect(result!.officials.referee1).toBe('Schiri');
            expect(result!.homeTeam.players?.length).toBe(1);
        });
    });
});
