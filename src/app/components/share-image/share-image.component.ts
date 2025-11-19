import { Component, OnInit, ElementRef, ViewChild, Inject, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { ImageGeneratorService } from '../../services/image-generator/image-generator.service';
import { MatIcon } from "@angular/material/icon";
import { ThemeService } from '../../services/theme/theme.service';

@Component({
  selector: 'app-share-image',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule, MatDialogModule, MatIcon],
  templateUrl: './share-image.component.html',
  styleUrls: ['./share-image.component.scss']
})
export class ShareImageComponent implements OnInit {
  @ViewChild('shareImage', { static: true }) shareImageElement: ElementRef<HTMLDivElement> | undefined;

  @HostBinding('class.dark-theme') get isDarkMode() {
    return this.themeService.effectiveTheme() === 'dark';
  }

  generatedImage: string | null = null;
  isLoading = false;

  homeTeam: any;
  guestTeam: any;
  finalScore: string;
  gameDate: string;
  gameLocation: string;
  league: string;
  quarterScores: any[];
  isFutureGame: boolean;

  constructor(
    private imageGeneratorService: ImageGeneratorService,
    private themeService: ThemeService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.homeTeam = data.homeTeam;
    this.guestTeam = data.guestTeam;
    this.finalScore = data.finalScore;
    this.gameDate = data.gameDate;
    this.gameLocation = data.gameLocation;
    this.league = data.league;
    this.quarterScores = data.quarterScores;
    this.isFutureGame = data.isFutureGame;
  }

  ngOnInit(): void {
    this.generateImage();
  }

  generateImage(): void {
    if (!this.shareImageElement) {
      return;
    }
    this.isLoading = true;
    // Use a timeout to ensure the view is rendered before generating the image
    setTimeout(() => {
      this.imageGeneratorService.generateImage(this.shareImageElement!.nativeElement)
        .then(imageUrl => {
          this.generatedImage = imageUrl;
          this.isLoading = false;
        })
        .catch(error => {
          console.error('Error generating image:', error);
          this.isLoading = false;
        });
    }, 500);
  }

  downloadImage(): void {
    if (this.generatedImage) {
      const link = document.createElement('a');
      link.href = this.generatedImage;
      link.download = `wasserball-spiel-${this.homeTeam.name}-vs-${this.guestTeam.name}.png`;
      link.click();
    }
  }
}
