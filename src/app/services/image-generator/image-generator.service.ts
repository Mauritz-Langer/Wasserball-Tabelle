import { Injectable } from '@angular/core';
import html2canvas from 'html2canvas';

@Injectable({
  providedIn: 'root'
})
export class ImageGeneratorService {

  constructor() { }

  async generateImage(element: HTMLElement): Promise<string> {
    const canvas = await html2canvas(element, {
      // The element is laid out at 1080 × 1920 px (story format); rendering it
      // 1:1 keeps memory and file size reasonable on phones.
      scale: 1,
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
