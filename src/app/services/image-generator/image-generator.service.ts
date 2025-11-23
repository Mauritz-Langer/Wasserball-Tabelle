import { Injectable } from '@angular/core';
import html2canvas from 'html2canvas';

@Injectable({
  providedIn: 'root'
})
export class ImageGeneratorService {

  constructor() { }

  async generateImage(element: HTMLElement): Promise<string> {
    const canvas = await html2canvas(element, {
      scale: 2, // Keep it high for quality, but 3 is too much for mobile
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: -window.scrollY,
      width: element.offsetWidth,
      height: element.offsetHeight,
      windowWidth: document.documentElement.offsetWidth,
      windowHeight: document.documentElement.offsetHeight,
    });
    return canvas.toDataURL('image/png', 1.0);
  }
}
