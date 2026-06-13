/** A game as returned by the DSV liveticker hub (getAllGames / updateGame). */
export interface LiveGame {
    Season: number;
    LeagueID: number;
    Gruppe: string;
    LeagueKind: string;
    GameID: number;
    GameIDShow?: number;

    HomeClubname?: string;
    GuestClubname?: string;
    HomeClubnameRaw?: string;
    GuestClubnameRaw?: string;

    HomeGoals?: number;
    GuestGoals?: number;
    HomeGoalsFinal?: number;
    GuestGoalsFinal?: number;
    ScoreText?: string;
    ScorePeriods?: string;
    GoalsPeriods?: string;

    Period?: number;
    Active?: boolean;

    LeagueName?: string;
    LeagueNameLive?: string;
    LiveShortText?: string;
    LiveShortCSS?: string;
    LiveDetailText?: string;
    LiveDetailCSS?: string;

    PoolName?: string;
    PoolCity?: string;
    Location?: string;
    StartDate?: string;

    HomeRegID?: string;
    HomeTeamID?: number;
    GuestRegID?: string;
    GuestTeamID?: number;

    [key: string]: any;
}

/** A single play/event in the live play-by-play (addPlay / updatePlay / getGamePlan). */
export interface LivePlay {
    Season: number;
    LeagueID: number;
    Gruppe: string;
    LeagueKind: string;
    GameID: number;
    Period: number;
    EventTime: string;
    Number: number;
    GamePlanHome?: string;
    GamePlanGuest?: string;
    GamePlanPlayer?: string;
    EventName?: string;
    EventKey?: string;
    LiveGoals?: string;
    Active: boolean;

    [key: string]: any;
}

export type LiveConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
