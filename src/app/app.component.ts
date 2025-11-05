import {Component} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {MatToolbar} from "@angular/material/toolbar";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatToolbar,
    RouterOutlet
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
}
