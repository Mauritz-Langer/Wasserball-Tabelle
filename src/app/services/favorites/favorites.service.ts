import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FavoritesService {
  private favoritesCountSubject = new BehaviorSubject<number>(0);
  public favoritesCount$: Observable<number> = this.favoritesCountSubject.asObservable();

  constructor() {
    this.updateCount();
  }

  updateCount(): void {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    this.favoritesCountSubject.next(favorites.length);
  }

  getCount(): number {
    return this.favoritesCountSubject.value;
  }
}

