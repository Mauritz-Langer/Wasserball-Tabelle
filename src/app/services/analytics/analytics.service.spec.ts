import { TestBed } from '@angular/core/testing';
import initSqlJs, { Database } from 'sql.js';
import { AnalyticsService } from './analytics.service';
import { DatabaseService } from '../database/database.service';

/**
 * Runs the real statistics SQL against a tiny in-memory database with the
 * schema written by scripts/build-archive.js.
 */
describe('AnalyticsService (gegen eine echte SQLite-Datenbank)', () => {
    let db: Database;
    let service: AnalyticsService;

    const SCHEMA = `
    CREATE TABLE leagues(no INTEGER PRIMARY KEY, id TEXT, season INTEGER, name TEXT);
    CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE players(id INTEGER PRIMARY KEY, name TEXT, birth_year INTEGER);
    CREATE TABLE clubs(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE games(id TEXT, league INTEGER, day TEXT, home INTEGER, guest INTEGER, hs INTEGER, gs INTEGER);
    CREATE TABLE scorers(player INTEGER, league INTEGER, club INTEGER, goals INTEGER, games INTEGER,
      PRIMARY KEY (player, league, club)) WITHOUT ROWID;

    INSERT INTO leagues VALUES (1, '2023_1', 2023, 'Bundesliga Männer'), (2, '2024_1', 2024, 'Bundesliga Männer'),
                               (3, '2024_2', 2024, 'Oberliga Nord');
    INSERT INTO teams VALUES (1, 'Alpha'), (2, 'Beta'), (3, 'Gamma');
    INSERT INTO players VALUES (1, 'Muster, Max', 2001), (2, 'Beispiel, Ben', 2008);
    INSERT INTO clubs VALUES (1, 'Alpha'), (2, 'Beta');
    -- in time order (rowid order = time order)
    INSERT INTO games VALUES
      ('2023_1_1', 1, '2023-10-01', 1, 2, 10, 5),
      ('2023_1_2', 1, '2023-10-08', 2, 1,  6, 8),
      ('2024_1_1', 2, '2024-10-05', 1, 3, 12, 3),
      ('2024_1_2', 2, '2024-10-12', 3, 1,  7, 7),
      ('2024_2_1', 3, '2024-11-02', 2, 3,  4, 9);
    INSERT INTO scorers VALUES (1, 1, 1, 6, 2), (1, 2, 1, 9, 2), (2, 2, 2, 3, 1), (2, 3, 2, 12, 1);
  `;

    beforeAll(async () => {
        const SQL = await initSqlJs({ locateFile: (file: string) => `${(globalThis as any).process.cwd()}/node_modules/sql.js/dist/${file}` });
        db = new SQL.Database();
        db.exec(SCHEMA);
    });

    afterAll(() => db.close());

    beforeEach(() => {
        const fake: Partial<DatabaseService> = {
            query: async <T>(_file: string, sql: string, params: any[] = []) => {
                const stmt = db.prepare(sql);
                stmt.bind(params);
                const rows: any[] = [];
                while (stmt.step())
                    rows.push(stmt.getAsObject());
                stmt.free();
                return rows as T[];
            }
        };
        TestBed.configureTestingModule({ providers: [{ provide: DatabaseService, useValue: fake }] });
        service = TestBed.inject(AnalyticsService);
    });

    it('zählt Spiele, Tore, Teams und Saisons – auch gefiltert', async () => {
        expect(await service.getTotals()).toEqual({ games: 5, goals: 71, teams: 3, leagues: 3, seasons: 2 });
        expect(await service.getTotals(2023)).toEqual({ games: 2, goals: 29, teams: 2, leagues: 1, seasons: 1 });
        expect(await service.getSeasons()).toEqual([2024, 2023]);
    });

    it('teilt Ergebnisse in Heimsieg, Remis und Auswärtssieg', async () => {
        expect(await service.getOutcomes()).toEqual({ home: 2, draw: 1, away: 2 });
    });

    it('gruppiert Spiele nach Toren in Fünferschritten', async () => {
        const buckets = await service.getGoalBuckets();
        expect(buckets.length).toBe(9);
        expect(buckets.find(b => b.label === '10–14')!.count).toBe(3);
        expect(buckets.find(b => b.label === '15–19')!.count).toBe(2);
    });

    it('liefert pro Saison Torschnitt und Heimsiegquote', async () => {
        const trend = await service.getSeasonTrend();
        expect(trend.map(t => t.season)).toEqual([2023, 2024]);
        expect(trend[0]).toEqual(expect.objectContaining({ games: 2, avgGoals: 14.5, homeWinPct: 50, partial: false }));
    });

    it('findet die längste Siegesserie in zeitlicher Reihenfolge', async () => {
        const [best] = await service.getWinningStreaks(1);
        expect(best).toEqual(expect.objectContaining({ team: 'Alpha', count: 3, from: '2023-10-01', to: '2024-10-05' }));
    });

    it('baut das Teamprofil mit Bilanz, Saisons und Gegnern', async () => {
        const p = (await service.getTeamProfile(1))!;
        expect(p.total).toEqual(expect.objectContaining({ games: 4, wins: 3, draws: 1, losses: 0, scored: 37, conceded: 21, winRate: 75 }));
        expect(p.home).toEqual({ games: 2, wins: 2, draws: 0, losses: 0 });
        expect(p.away).toEqual({ games: 2, wins: 1, draws: 1, losses: 0 });
        expect(p.seasons.map(s => s.season)).toEqual([2023, 2024]);
        expect(p.rivals.map(r => r.name).sort()).toEqual(['Beta', 'Gamma']);
        expect(p.biggestWins[0]).toEqual(expect.objectContaining({ opponent: 'Gamma', own: 12, other: 3 }));
        expect(p.recent[0].id).toBe('2024_1_2');
        expect(p.longestWinStreak).toBe(3);
        expect(await service.getTeamProfile(99)).toBeNull();
    });

    it('baut das Spielerprofil mit Stationen und bester Saison', async () => {
        const p = (await service.getPlayerProfile(2))!;
        expect(p).toEqual(expect.objectContaining({ goals: 15, games: 2, avg: 7.5, birthYear: 2008 }));
        expect(p.best).toEqual(expect.objectContaining({ goals: 15, season: 2024, club: 'Beta' }));
        // Both 2024 competitions at Beta are one spell.
        expect(p.spells.length).toBe(1);
        expect(p.spells[0]).toEqual(expect.objectContaining({ season: 2024, club: 'Beta', goals: 15, games: 2 }));
        expect(p.spells[0].leagues.map(l => l.name).sort()).toEqual(['Bundesliga Männer', 'Oberliga Nord']);
        expect(p.clubs).toEqual(['Beta']);
    });

    it('erstellt Ranglisten', async () => {
        const all = await service.getTopScorers(10);
        expect(all.map(r => r.goals)).toEqual([15, 15]);
        expect(all.map(r => r.name).sort()).toEqual(['Beispiel, Ben', 'Muster, Max']);
        expect((await service.getTopScorers(10, 2023)).map(r => r.name)).toEqual(['Muster, Max']);
        expect((await service.getYoungTalents(10, 2026)).map(r => r.name)).toEqual(['Beispiel, Ben']);
        // Ranking uses the season sums, not a single row: Max has 6 + 9 = 15 in 4 games.
        const efficient = await service.getMostEfficient(10);
        expect(efficient).toEqual([]); // nobody has 30 games yet
    });

    it('wertet Ligen aus', async () => {
        const l = (await service.getLeagueProfile(2))!;
        expect(l).toEqual(expect.objectContaining({ games: 2, goals: 29, maxGoals: 15, avgGoals: 14.5 }));
        expect(l.outcomes).toEqual({ home: 1, draw: 1, away: 0 });
        expect(l.scorers[0].name).toBe('Muster, Max');
        const levels = await service.getLevelComparison();
        expect(levels.map(x => x.level).sort()).toEqual(['Bundesliga', 'Oberliga']);
    });

    it('sortiert die Teamsuche nach Anzahl Spiele', async () => {
        const teams = await service.getTeams();
        expect(teams[0]).toEqual({ id: 1, name: 'Alpha', games: 4 });
    });
});
