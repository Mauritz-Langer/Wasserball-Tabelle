import { Component, OnInit, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { Router } from '@angular/router';
import { MatIcon } from "@angular/material/icon";
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
  MatExpansionPanelDescription
} from "@angular/material/expansion";
import { MatIconButton } from "@angular/material/button";
import * as amplitude from '@amplitude/unified';

import { MatCard, MatCardContent } from "@angular/material/card";
import { OverviewService } from "../../services/overview/overview.service";
import { SeasonService } from "../../services/season/season.service";
import { FavoritesService } from "../../services/favorites/favorites.service";
import { MatSelectModule } from "@angular/material/select";
import { MatOptionModule } from "@angular/material/core";
import { Item } from "../../models/item";
import { SubItem } from "../../models/subItem";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatTooltip } from "@angular/material/tooltip";
import { MatFormField, MatLabel, MatPrefix, MatSuffix } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { FormsModule } from "@angular/forms";

@Component({
  selector: 'app-overview',
  imports: [MatIcon, MatAccordion, MatExpansionPanel, MatIconButton, MatExpansionPanelTitle, MatExpansionPanelDescription, MatExpansionPanelHeader, MatCard, MatCardContent, MatProgressSpinner, MatTooltip, MatFormField, MatInput, MatLabel, MatPrefix, MatSuffix, FormsModule, MatSelectModule, MatOptionModule],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss'
})
export class OverviewComponent implements OnInit {
  private overviewService = inject(OverviewService);
  public seasonService = inject(SeasonService);
  private favoritesService = inject(FavoritesService);
  private router = inject(Router);


  items: Item[] = [];
  filteredItems: Item[] = [];
  isLoading = true;
  searchTerm = '';

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    toObservable(this.seasonService.currentSeason).pipe(
      switchMap(() => {
        this.isLoading = true;
        return this.overviewService.getItems();
      })
    ).subscribe(
      (items: Item[]) => {
        this.items = items;
        this.filteredItems = [...this.items];
        this.loadFavorites();
        this.isLoading = false;
      },
      (error) => {
        console.error('Error loading items:', error);
        this.isLoading = false;
      }
    );
  }

  ngOnInit(): void {
  }

  get favorites(): SubItem[] {
    return this.items.flatMap(item => item.subItems.filter(subItem => subItem.isFavorite));
  }

  filterItems(): void {
    const term = this.searchTerm.toLowerCase().trim();

    if (!term) {
      this.filteredItems = [...this.items];
      return;
    }

    let resultCount = 0;
    this.filteredItems = this.items
      .map(item => {
        const filteredSubItems = item.subItems.filter(subItem =>
          subItem.name.toLowerCase().includes(term) ||
          (subItem.gender?.toLowerCase().includes(term) ?? false)
        );

        resultCount += filteredSubItems.length;

        return {
          ...item,
          subItems: filteredSubItems
        };
      })
      .filter(item => item.subItems.length > 0);

    amplitude.track('Search Performed', {
      searchTerm: term,
      resultCount: resultCount,
    });
  }

  toggleFavorite(subItem: SubItem): void {
    // Finde das SubItem im originalen items Array und aktualisiere es dort
    this.items.forEach(item => {
      const originalSubItem = item.subItems.find(si => si.link === subItem.link && si.name === subItem.name);
      if (originalSubItem) {
        originalSubItem.isFavorite = !originalSubItem.isFavorite;
        // Synchronisiere mit dem gefilterten Item
        subItem.isFavorite = originalSubItem.isFavorite;
        amplitude.track(originalSubItem.isFavorite ? 'Favorite Added' : 'Favorite Removed', {
          leagueName: originalSubItem.name,
        });
      }
    });
    this.saveFavorites();
    // Aktualisiere die gefilterten Items, um Änderungen zu reflektieren
    this.filterItems();
  }

  saveFavorites(): void {
    const favorites = this.items.flatMap(item => item.subItems.filter(subItem => subItem.isFavorite));
    localStorage.setItem('favorites', JSON.stringify(favorites));
    // Notify the service about the change
    this.favoritesService.updateCount();
  }

  loadFavorites(): void {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    this.items.forEach(item => {
      item.subItems.forEach(subItem => {
        subItem.isFavorite = favorites.some((fav: SubItem) => fav.name === subItem.name);
      });
    });
    // Update filtered items to reflect favorites
    this.filterItems();
    // Update the count after loading
    this.favoritesService.updateCount();
  }

  navigateToLiga(subItem: SubItem) {
    amplitude.track('League Selected', { leagueName: subItem.name });
    let param = subItem.link;
    this.router.navigate(['/liga'], { queryParams: { param } });
  }

  navigateToAnalytics() {
    this.router.navigate(['/analytics']);
  }
}
