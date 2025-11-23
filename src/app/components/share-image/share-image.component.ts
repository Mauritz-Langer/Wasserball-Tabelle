import { Component, OnInit, ElementRef, ViewChild, Inject, HostBinding, AfterViewInit, Renderer2, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { ImageGeneratorService } from '../../services/image-generator/image-generator.service';
import { MatIcon } from "@angular/material/icon";
import { ThemeService } from '../../services/theme/theme.service';
import * as amplitude from '@amplitude/unified';

@Component({
  selector: 'app-share-image',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule, MatDialogModule, MatIcon],
  templateUrl: './share-image.component.html',
  styleUrls: ['./share-image.component.scss']
})
export class ShareImageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('shareImage', { static: true }) shareImageElement!: ElementRef<HTMLDivElement>;
  private originalParent: HTMLElement | null = null;
  private placeholder: Comment | null = null;

  @HostBinding('class.dark-theme') get isDarkMode() {
    return this.themeService.effectiveTheme() === 'dark';
  }

  generatedImage: string | null = null;
  isLoading = false;

  homeTeam: any;
  guestTeam: any;
  finalScore: string;
  gameDate: Date | null;
  gameLocation: string;
  league: string;
  quarterScores: any[];
  isFutureGame: boolean;

  constructor(
    private imageGeneratorService: ImageGeneratorService,
    private themeService: ThemeService,
    private renderer: Renderer2,
    private el: ElementRef,
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
    // Lifecycle setup
  }

  ngAfterViewInit(): void {
    // Use a timeout to ensure the dialog is fully rendered before starting generation
    setTimeout(() => this.generateImage(), 100);
  }

  private prepareForCanvas(): void {
    const element = this.shareImageElement.nativeElement;
    this.originalParent = element.parentElement;
    this.placeholder = this.renderer.createComment('Original share-image position');

    if (this.originalParent) {
      this.renderer.insertBefore(this.originalParent, this.placeholder, element);
    }

    // Move element to body for clean rendering
    this.renderer.appendChild(document.body, element);

    // Apply styles to position it off-screen but keep it renderable
    this.renderer.setStyle(element, 'position', 'absolute');
    this.renderer.setStyle(element, 'top', '0');
    this.renderer.setStyle(element, 'left', '-9999px');
    this.renderer.setStyle(element, 'width', '1080px');
    this.renderer.setStyle(element, 'height', '1920px');
    this.renderer.removeStyle(element, 'opacity'); // Ensure opacity is not 0
    this.renderer.removeStyle(element, 'z-index'); // Reset z-index

    // Force image dimensions with !important to override global responsive styles
    const imageElements: NodeListOf<HTMLImageElement> = element.querySelectorAll('img');
    imageElements.forEach(img => {
      // Reset any potentially conflicting properties from global styles
      img.style.setProperty('max-width', 'none', 'important');
      img.style.setProperty('max-height', 'none', 'important');

      if (img.classList.contains('team-logo-large')) {
        img.style.setProperty('width', '400px', 'important');
        img.style.setProperty('height', '400px', 'important');
      } else if (img.classList.contains('team-logo')) {
        img.style.setProperty('width', '250px', 'important');
        img.style.setProperty('height', '250px', 'important');
      }
    });
  }

  private cleanupAfterCanvas(): void {
    const element = this.shareImageElement.nativeElement;

    // Move element back to its original position
    if (this.originalParent && this.placeholder) {
      this.renderer.insertBefore(this.originalParent, element, this.placeholder);
      this.renderer.removeChild(this.originalParent, this.placeholder);
      this.placeholder = null;
    } else {
      this.renderer.appendChild(this.el.nativeElement, element);
    }

    // Remove the container styles we added
    this.renderer.removeStyle(element, 'position');
    this.renderer.removeStyle(element, 'top');
    this.renderer.removeStyle(element, 'left');
    this.renderer.removeStyle(element, 'width');
    this.renderer.removeStyle(element, 'height');

    // Remove the inline styles from the images
    const imageElements: NodeListOf<HTMLImageElement> = element.querySelectorAll('img');
    imageElements.forEach(img => {
      img.style.removeProperty('width');
      img.style.removeProperty('height');
      img.style.removeProperty('max-width');
      img.style.removeProperty('max-height');
    });
  }

  generateImage(): void {
    if (!this.shareImageElement) {
      return;
    }
    this.isLoading = true;

    this.prepareForCanvas();

    // Short timeout to allow the browser to apply the DOM and style changes
    setTimeout(() => {
      this.imageGeneratorService.generateImage(this.shareImageElement.nativeElement)
        .then(imageUrl => {
          this.generatedImage = imageUrl;
          this.isLoading = false;
          this.cleanupAfterCanvas();
        })
        .catch(error => {
          console.error('Error generating image:', error);
          amplitude.track('Error Occurred', {
            errorMessage: 'Error generating image',
            errorContext: 'generateImage',
          });
          this.isLoading = false;
          this.cleanupAfterCanvas();
        });
    }, 150); // Slightly increased timeout for stability
  }

  downloadImage(): void {
    if (this.generatedImage) {
      amplitude.track('Share Image Downloaded', {
        league: this.league,
        homeTeam: this.homeTeam.name,
        guestTeam: this.guestTeam.name,
      });
      const link = document.createElement('a');
      link.href = this.generatedImage;
      link.download = `wasserball-spiel-${this.homeTeam.name}-vs-${this.guestTeam.name}.png`;
      link.click();
    }
  }

  ngOnDestroy(): void {
    // Ensure cleanup is run if the component is destroyed unexpectedly
    if (this.placeholder) {
      this.cleanupAfterCanvas();
    }
  }
}
