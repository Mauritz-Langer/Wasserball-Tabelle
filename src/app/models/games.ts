export interface Games {
  start: string;
  home: string;
  homeImageUrl: string;
  guest: string;
  guestImageUrl: string;
  location: string;
  gameLink: string;
  result: string;
  /** DSV game number within the league (optional). */
  number?: string;
  /** Round / matchday heading the game is listed under, e.g. "3. Spieltag". */
  round?: string;
  /** Per-quarter results as shown by DSV, e.g. "(2:1, 4:3, 6:4, 5:0)". */
  quarters?: string;
}
