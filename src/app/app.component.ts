import {Component} from '@angular/core';
import {Router, RouterOutlet} from '@angular/router';
import {MatIcon} from "@angular/material/icon";
import {MatButton, MatIconButton} from "@angular/material/button";
import {MatToolbar} from "@angular/material/toolbar";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatToolbar,
    RouterOutlet,
    MatIconButton,
    MatIcon,
    MatButton
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {

  constructor(private router: Router) {
  }

  navigateToStart(): void {
    this.router.navigate(['/']);
  }
}
