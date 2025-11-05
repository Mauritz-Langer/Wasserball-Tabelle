export interface GameDetails {
  // Grundinformationen
  gameId: string;
  league: string;
  startDate: string;
  playKind: string;

  // Teams
  homeTeam: TeamDetails;
  guestTeam: TeamDetails;

  // Spielstand
  finalScore: string;
  quarterScores: QuarterScore[];

  // Spielort
  venue: Venue;

  // Offizielle
  officials: Officials;

  // Spielverlauf
  events: GameEvent[];

  // Statistiken
  statistics?: GameStatistics;

  // Zusätzlich
  notes?: string;
  videoLink?: string;
  protocolLink?: string;
  endGameTime?: string;
  organizer?: string;
}

export interface TeamDetails {
  name: string;
  logoUrl: string;
  coach?: string;
  captain?: string;
  teamLeader?: string;
  assistant?: string;
  bestPlayer?: string;
  players?: PlayerStatistics[];
}

export interface QuarterScore {
  quarter: number;
  home: number;
  guest: number;
}

export interface Venue {
  poolName: string;
  poolCity: string;
  googleMapsLink: string;
}

export interface Officials {
  referee1?: string;
  referee2?: string;
  timekeeper1?: string;
  timekeeper2?: string;
  secretary1?: string;
  secretary2?: string;
  goalJudge1?: string;
  goalJudge2?: string;
  observer1?: string;
  observer2?: string;
}

export interface GameEvent {
  time: string;
  period: number;
  homeScore: number;
  guestScore: number;
  player: string;
  eventType: string;
  goalNumber?: number;
}

export interface GameStatistics {
  home: TeamStatistics;
  guest: TeamStatistics;
}

export interface TeamStatistics {
  label: string;
  data: { [key: string]: string };
}

export interface PlayerStatistics {
  number: string;
  name: string;
  birthYear: string;
  goals: number;
  fouls: PersonalFoul[];
}

export interface PersonalFoul {
  quarter: number;
  foulType: string; // 'S' = Strafwurf, 'A' = Ausschluss, '' = kein Foul
}
