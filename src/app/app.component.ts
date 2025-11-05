import {Component, OnInit} from '@angular/core';
import {Router, RouterOutlet, NavigationEnd} from '@angular/router';
import {MatToolbar} from "@angular/material/toolbar";
import {MatIcon} from "@angular/material/icon";
import {MatIconButton, MatButton} from "@angular/material/button";
import {NgIf} from "@angular/common";
import {MatTooltip} from "@angular/material/tooltip";
import {filter} from "rxjs";
import {FavoritesService} from "./services/favorites/favorites.service";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatToolbar,
    RouterOutlet,
    MatIcon,
    MatIconButton,
    NgIf,
    MatTooltip,
    MatButton
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  isHomePage = true;
  currentYear = new Date().getFullYear();
  favoritesCount = 0;

  constructor(
    private router: Router,
    private favoritesService: FavoritesService
  ) {}

  ngOnInit(): void {
    // Track route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.isHomePage = event.url === '/' || event.url.startsWith('/?');
    });

    // Subscribe to favorites count changes
    this.favoritesService.favoritesCount$.subscribe(count => {
      this.favoritesCount = count;
    });
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  openDsvWebsite(): void {
    window.open('https://dsvdaten.dsv.de/Modules/WB/Index.aspx', '_blank');
  }
}
