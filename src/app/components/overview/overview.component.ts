import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {MatIcon} from "@angular/material/icon";
import {
  MatAccordion,
  MatExpansionPanel, MatExpansionPanelDescription,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle
} from "@angular/material/expansion";
import {MatList, MatListItem} from "@angular/material/list";
import {MatButton, MatIconButton} from "@angular/material/button";
import {NgForOf, NgIf} from "@angular/common";
import {MatCard, MatCardContent} from "@angular/material/card";
import {MatToolbar} from "@angular/material/toolbar";
import {OverviewService} from "../../services/overview/overview.service";
import {Item} from "../../models/item";
import {SubItem} from "../../models/subItem";
import {MatProgressSpinner} from "@angular/material/progress-spinner";
import {MatTooltip} from "@angular/material/tooltip";

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [MatIcon, MatAccordion, MatExpansionPanel, MatList, MatListItem, MatIconButton, NgForOf, MatExpansionPanelTitle, MatExpansionPanelDescription, MatExpansionPanelHeader, MatCard, MatCardContent, MatToolbar, MatButton, MatProgressSpinner, NgIf, MatTooltip],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss'
})
export class OverviewComponent implements OnInit {

  items: Item[] = [];
  isLoading = true;

  constructor(private overviewService: OverviewService, private router: Router) {
  }


  ngOnInit(): void {
    this.overviewService.getItems().subscribe(
      (html: string) => {
        // Process the HTML content to extract items
        this.items = this.overviewService.parseHtmlToItems(html);
        this.loadFavorites();
        this.isLoading = false;
      }
    );
  }

  get favorites(): SubItem[] {
    return this.items.flatMap(item => item.subItems.filter(subItem => subItem.isFavorite));
  }

  toggleFavorite(subItem: SubItem): void {
    subItem.isFavorite = !subItem.isFavorite;
    this.saveFavorites();
  }

  saveFavorites(): void {
    const favorites = this.items.flatMap(item => item.subItems.filter(subItem => subItem.isFavorite));
    localStorage.setItem('favorites', JSON.stringify(favorites));
  }

  loadFavorites(): void {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    this.items.forEach(item => {
      item.subItems.forEach(subItem => {
        subItem.isFavorite = favorites.some((fav: SubItem) => fav.name === subItem.name);
      });
    });
  }

  navigateToLiga(subItem: SubItem) {
    let param = subItem.link;
    this.router.navigate(['liga'], {queryParams: {param}});
  }
}
