/**
 * Shared game identity across the app.
 *
 * The DSV site, the league (Liga) view and the SignalR liveticker all identify
 * a game by the same five fields. This lets us cross-link them: a Liga game
 * card can detect that it is live, the liveticker can link back to the league
 * page or the full match report, etc.
 */
export interface GameRef {
    season: string;
    leagueId: string;
    group: string;
    leagueKind: string;
    gameId: string;
}

/** Stable key: "2025_196__L_32" (group may be empty). */
export function gameKey(ref: GameRef): string {
    return `${ref.season}_${ref.leagueId}_${ref.group ?? ''}_${ref.leagueKind}_${ref.gameId}`;
}

/** Key directly from a liveticker game object. */
export function liveGameKey(g: {
    Season: any; LeagueID: any; Gruppe?: any; LeagueKind: any; GameID: any;
}): string {
    return gameKey({
        season: String(g.Season ?? ''),
        leagueId: String(g.LeagueID ?? ''),
        group: String(g.Gruppe ?? ''),
        leagueKind: String(g.LeagueKind ?? ''),
        gameId: String(g.GameID ?? '')
    });
}

/**
 * Parse a DSV "Game.aspx?Season=..&LeagueID=..&Group=..&LeagueKind=..&GameID=.."
 * link (the `gameLink` carried by Liga games) into a GameRef. Returns null for
 * anything that isn't a parameterised Game.aspx link (e.g. historical DB ids).
 */
export function parseGameLink(link: string | undefined | null): GameRef | null {
    if (!link || !/Game\.aspx/i.test(link)) return null;
    const q = link.substring(link.indexOf('?') + 1);
    const params = new URLSearchParams(q);
    const season = params.get('Season');
    const leagueId = params.get('LeagueID');
    const gameId = params.get('GameID');
    if (!season || !leagueId || !gameId) return null;
    return {
        season,
        leagueId,
        group: params.get('Group') ?? '',
        leagueKind: params.get('LeagueKind') ?? '',
        gameId
    };
}

/** Build the DSV League.aspx link (the Liga view's `param`) for a game's league. */
export function buildLeagueLink(ref: GameRef): string {
    return `League.aspx?Season=${ref.season}&LeagueID=${ref.leagueId}` +
        `&Group=${ref.group ?? ''}&LeagueKind=${ref.leagueKind}`;
}

/** Build the DSV Game.aspx link (the game-details view's `param`). */
export function buildGameLink(ref: GameRef): string {
    return `Game.aspx?Season=${ref.season}&LeagueID=${ref.leagueId}` +
        `&Group=${ref.group ?? ''}&LeagueKind=${ref.leagueKind}&GameID=${ref.gameId}`;
}
