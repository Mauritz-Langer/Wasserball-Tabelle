export interface SubItem {
  name: string;
  gender: string;
  link: string;
  isFavorite: boolean;
  /** Free-text league status from the DSV index, e.g. "in 5 Tagen", "beendet". */
  status?: string;
}
