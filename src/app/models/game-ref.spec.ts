import { parseGameLink, gameKey, liveGameKey, buildLeagueLink, buildGameLink } from './game-ref';

describe('game-ref', () => {
    const link = 'Game.aspx?Season=2025&LeagueID=196&Group=&LeagueKind=L&GameID=32';

    it('parses a DSV Game.aspx link into a ref', () => {
        const ref = parseGameLink(link);
        expect(ref).toEqual({ season: '2025', leagueId: '196', group: '', leagueKind: 'L', gameId: '32' });
    });

    it('returns null for non-Game.aspx links (e.g. historical ids)', () => {
        expect(parseGameLink('2018_128_1_1')).toBeNull();
        expect(parseGameLink('League.aspx?Season=2025&LeagueID=196')).toBeNull();
        expect(parseGameLink('')).toBeNull();
    });

    it('produces matching keys from a link and from a live game object', () => {
        const fromLink = gameKey(parseGameLink(link)!);
        const fromLive = liveGameKey({ Season: 2025, LeagueID: 196, Gruppe: '', LeagueKind: 'L', GameID: 32 });
        expect(fromLink).toBe('2025_196__L_32');
        expect(fromLive).toBe(fromLink);
    });

    it('keys distinguish groups', () => {
        const a = liveGameKey({ Season: 2025, LeagueID: 183, Gruppe: 'A', LeagueKind: 'E', GameID: 20 });
        const b = liveGameKey({ Season: 2025, LeagueID: 183, Gruppe: 'B', LeagueKind: 'E', GameID: 20 });
        expect(a).not.toBe(b);
    });

    it('builds League.aspx and Game.aspx links from a ref', () => {
        const ref = parseGameLink(link)!;
        expect(buildLeagueLink(ref)).toBe('League.aspx?Season=2025&LeagueID=196&Group=&LeagueKind=L');
        expect(buildGameLink(ref)).toBe('Game.aspx?Season=2025&LeagueID=196&Group=&LeagueKind=L&GameID=32');
    });
});
