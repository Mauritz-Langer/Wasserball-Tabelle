export interface Table {
  place: number;
  team: string;
  info: string;
  imageUrl: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: string;
  goalDifference: number;
  points: number;
  form?: ('W' | 'D' | 'L')[]; // Win, Draw, Loss - Die letzten 5 Spiele
}
