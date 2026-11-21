import { Games } from '../models/games';
import { LeagueData } from '../services/liga/liga.service';
import { GameDetails } from '../models/game-details';

export const LIGA_PARAM = 'League.aspx?Season=2026&LeagueID=9&Group=&LeagueKind=V';

export function makeGame(over: Partial<Games>): Games {
  return {
    start: '02.10.26, 20:30 Uhr', home: 'Alpha', homeImageUrl: '', guest: 'Beta', guestImageUrl: '',
    location: 'Hallenbad', gameLink: '', result: ' - ', ...over
  };
}

/** A small league: two results in the past, one fixture far in the future. */
export function makeLeague(): LeagueData {
  const link = (id: number) => `Game.aspx?Season=2026&LeagueID=9&Group=&LeagueKind=V&GameID=${id}`;
  return {
    name: 'Testliga männlich',
    games: [
      makeGame({ start: '01.10.20, 18:00 Uhr', result: '10:7', gameLink: link(1), round: '1. Spieltag' }),
      makeGame({ start: '08.10.20, 18:00 Uhr', home: 'Beta', guest: 'Gamma', result: '5:5', gameLink: link(2), round: '2. Spieltag' }),
      makeGame({ start: '01.10.99, 18:00 Uhr', home: 'Gamma', guest: 'Alpha', gameLink: link(3), round: '3. Spieltag' })
    ],
    table: [
      { place: 1, team: 'Alpha', info: '', imageUrl: '', games: 1, wins: 1, draws: 0, losses: 0, goals: '10:7', goalDifference: 3, points: 3 },
      { place: 2, team: 'Gamma', info: '', imageUrl: '', games: 1, wins: 0, draws: 1, losses: 0, goals: '5:5', goalDifference: 0, points: 1 },
      { place: 3, team: 'Beta', info: '', imageUrl: '', games: 2, wins: 0, draws: 1, losses: 1, goals: '12:15', goalDifference: -3, points: 1 }
    ],
    scorers: [
      { place: 1, name: 'Muster, Max (2001)', team: 'Alpha', goals: 6, games: 1 },
      { place: 2, name: 'Beispiel, Ben (1999)', team: 'Beta', goals: 4, games: 2 }
    ]
  };
}

export function makeDetails(over: Partial<GameDetails> = {}): GameDetails {
  return {
    gameId: '1', league: 'Testliga', startDate: '01.10.2020 18:00 Uhr', playKind: 'Runde',
    homeTeam: {
      name: 'Alpha', logoUrl: '',
      players: [{ number: '1', name: 'Keeper, K.', birthYear: '1990', goals: 0, fouls: [] },
        { number: '5', name: 'Muster, Max', birthYear: '2001', goals: 2, fouls: [{ quarter: 2, foulType: 'A' }] }]
    },
    guestTeam: { name: 'Beta', logoUrl: '', players: [{ number: '7', name: 'Beispiel, Ben', birthYear: '1999', goals: 1, fouls: [] }] },
    finalScore: '2:1',
    quarterScores: [{ quarter: 1, home: 1, guest: 1 }, { quarter: 2, home: 1, guest: 0 }],
    venue: { poolName: 'Hallenbad', poolCity: 'Teststadt', googleMapsLink: '' },
    officials: { referee1: 'Pfeife, P.' },
    events: [
      { time: '7:30', period: 1, homeScore: 0, guestScore: 1, player: 'Beispiel, B.', eventType: 'T', side: 'guest', cap: '7' },
      { time: '2:00', period: 1, homeScore: 1, guestScore: 1, player: 'Muster, M.', eventType: 'T', side: 'home', cap: '5' },
      { time: '0:00', period: 1, homeScore: 1, guestScore: 1, player: '', eventType: 'X', side: 'home', cap: '0' },
      { time: '6:00', period: 2, homeScore: 1, guestScore: 1, player: 'Muster, M.', eventType: 'A', side: 'home', cap: '5' },
      { time: '4:00', period: 2, homeScore: 2, guestScore: 1, player: 'Muster, M.', eventType: 'T', side: 'home', cap: '5' }
    ],
    ...over
  };
}
