import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { teamInitial } from '../models/game-utils';

/** What the analysis made of one logo source. */
interface CleanLogo {
  /** Trimmed raster version, or '' to keep the original (already tight). */
  url: string;
  /** Logo is drawn in white only: it needs a dark tile. */
  light: boolean;
}

/** One analysis per logo source, shared by every row that shows it. */
const cache = new Map<string, Promise<CleanLogo | null>>();

/** Analysis canvas edge: big enough to stay sharp at 60 px on 3x screens. */
const N = 384;

/**
 * Makes club logos readable everywhere. Logos come straight from the DSV
 * (inline SVG) or the archive and vary wildly: dark marks on transparent
 * ground, wide empty margins, the odd blank rectangle. Every logo sits on a
 * light tile (styles.scss); this directive additionally
 *  - trims empty or white margins so the crest fills its tile,
 *  - flags white-only logos so they get a dark tile instead,
 *  - replaces broken, empty or single-colour images with the team's initial.
 * The team name for the initial comes from `data-name`.
 */
@Directive({ selector: 'img.logo, img.spot-logo, img.board-logo' })
export class LogoFallbackDirective {
  private img = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
  /** Sources this directive set itself; their load events are ignored. */
  private own = new Set<string>();

  @HostListener('load')
  onLoad(): void {
    const src = this.img.currentSrc || this.img.src;
    if (this.own.has(src)) return;
    this.img.classList.remove('logo-missing', 'logo-light');
    let job = cache.get(src);
    if (!job) {
      job = analyse(this.img);
      cache.set(src, job);
    }
    job.then(result => {
      if ((this.img.currentSrc || this.img.src) !== src) return; // row now shows another team
      if (!result) return this.showInitial();
      this.img.classList.toggle('logo-light', result.light);
      if (result.url) this.setOwn(result.url);
    });
  }

  @HostListener('error')
  onError(): void {
    if (!this.own.has(this.img.currentSrc || this.img.src)) this.showInitial();
  }

  private showInitial(): void {
    const letter = teamInitial(this.img.dataset['name']).replace(/[<&>]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">` +
      `<rect width="40" height="40" rx="10" fill="#c9d6dc"/>` +
      `<text x="20" y="27" text-anchor="middle" font-family="Arial Narrow,Arial,sans-serif" font-size="20" font-weight="700" fill="#2f4651">${letter}</text></svg>`;
    this.img.classList.remove('logo-light');
    this.img.classList.add('logo-missing');
    this.setOwn('data:image/svg+xml,' + encodeURIComponent(svg));
  }

  private setOwn(url: string): void {
    this.own.add(url);
    this.img.src = url;
  }
}

/** Measures a loaded logo on a canvas and builds its trimmed version. */
async function analyse(img: HTMLImageElement): Promise<CleanLogo | null> {
  try {
    const w0 = img.naturalWidth || N;
    const h0 = img.naturalHeight || N;
    const k = N / Math.max(w0, h0);
    const w = Math.max(1, Math.round(w0 * k));
    const h = Math.max(1, Math.round(h0 * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { url: '', light: false };
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;

    // Two boxes: everything opaque, and everything that is neither
    // transparent nor (near) white, i.e. what shows on a white tile.
    const opaque = box();
    const ink = box();
    let opaqueCount = 0;
    let lumMin = 255;
    let lumMax = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (px[i + 3] < 40) continue;
        opaqueCount++;
        grow(opaque, x, y);
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum < lumMin) lumMin = lum;
        if (lum > lumMax) lumMax = lum;
        if (px[i] < 236 || px[i + 1] < 236 || px[i + 2] < 236) grow(ink, x, y);
      }
    }

    if (!opaqueCount) return null; // fully transparent
    const filled = opaqueCount / ((opaque.x1 - opaque.x0 + 1) * (opaque.y1 - opaque.y0 + 1));
    if (filled > 0.97 && lumMax - lumMin < 24) return null; // a plain rectangle, no crest

    const light = ink.x1 < 0; // only white marks
    const b = light ? opaque : ink;
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    // Already tight: keep the original (vector stays sharpest).
    if (bw > w * 0.9 && bh > h * 0.9) return { url: '', light };

    const pad = Math.round(Math.max(bw, bh) * 0.04);
    const sx = Math.max(0, b.x0 - pad);
    const sy = Math.max(0, b.y0 - pad);
    const sw = Math.min(w, b.x1 + 1 + pad) - sx;
    const sh = Math.min(h, b.y1 + 1 + pad) - sy;
    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    out.getContext('2d')!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return { url: out.toDataURL('image/png'), light };
  } catch {
    // Canvas tainted (foreign image without CORS) or no canvas: tile only.
    return { url: '', light: false };
  }
}

function box() {
  return { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
}

function grow(b: ReturnType<typeof box>, x: number, y: number): void {
  if (x < b.x0) b.x0 = x;
  if (x > b.x1) b.x1 = x;
  if (y < b.y0) b.y0 = y;
  if (y > b.y1) b.y1 = y;
}
