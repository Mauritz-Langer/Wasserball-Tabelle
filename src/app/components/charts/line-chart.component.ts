import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface LineSeries {
  name: string;
  /** One value per label; null leaves a gap. */
  values: (number | null)[];
  /** Palette slot: 1 = primary series, 2 = contrast series. */
  slot?: 1 | 2;
}

const W = 320, H = 150;
const PAD = { top: 10, right: 8, bottom: 6, left: 30 };

/**
 * Small line chart for values over seasons. The readout above the plot shows
 * the values of the point under the finger / cursor (the latest by default),
 * so no value has to be guessed from the axis. One y-axis, starting at zero
 * unless `zeroBased` is switched off.
 */
@Component({
  selector: 'app-line-chart',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="readout" aria-hidden="true">
      <span class="at">{{ labels()[active()] }}</span>
      @for (s of series(); track s.name) {
        <span class="val">
          <i [class]="'swatch s' + (s.slot ?? 1)"></i>
          @if (series().length > 1) { <span class="name">{{ s.name }}</span> }
          <b class="num">{{ s.values[active()] === null ? '–' : (s.values[active()] | number: format()) }}{{ unit() }}</b>
        </span>
      }
    </div>
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="summary()"
      (pointermove)="pick($event)" (pointerdown)="pick($event)" (pointerleave)="hover.set(null)">
      @for (t of ticks(); track t.value) {
        <line class="grid" [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="t.y" [attr.y2]="t.y" />
        <text class="tick" [attr.x]="PAD.left - 5" [attr.y]="t.y + 3" text-anchor="end">{{ t.value | number: '1.0-1' }}</text>
      }
      <line class="cross" [attr.x1]="x(active())" [attr.x2]="x(active())" [attr.y1]="PAD.top" [attr.y2]="H - PAD.bottom" />
      @for (p of paths(); track p.name) {
        <path [class]="'line s' + p.slot" [attr.d]="p.d" />
        @if (p.dot; as dot) {
          <circle [class]="'dot s' + p.slot" [attr.cx]="dot.x" [attr.cy]="dot.y" r="4" />
        }
      }
    </svg>
    <div class="x-axis num" aria-hidden="true">
      <span>{{ labels()[0] }}</span>
      @if (labels().length > 4) { <span>{{ labels()[middle()] }}</span> }
      <span>{{ labels()[labels().length - 1] }}</span>
    </div>
    <div class="sr-only"><table>
      <caption>{{ summary() }}</caption>
      <tr><th>Saison</th>@for (s of series(); track s.name) { <th>{{ s.name }}</th> }</tr>
      @for (label of labels(); track $index; let i = $index) {
        <tr><td>{{ label }}</td>@for (s of series(); track s.name) { <td>{{ s.values[i] }}</td> }</tr>
      }
    </table></div>
  `,
  styleUrl: './charts.scss'
})
export class LineChartComponent {
  readonly labels = input.required<string[]>();
  readonly series = input.required<LineSeries[]>();
  readonly unit = input('');
  readonly decimals = input(0);
  readonly zeroBased = input(true);
  readonly title = input('');

  readonly W = W;
  readonly H = H;
  readonly PAD = PAD;

  readonly hover = signal<number | null>(null);
  /** Hovered point, else the latest one. */
  readonly active = computed(() => Math.min(this.hover() ?? this.labels().length - 1, this.labels().length - 1));
  readonly middle = computed(() => Math.floor((this.labels().length - 1) / 2));
  readonly format = computed(() => `1.${this.decimals()}-${this.decimals()}`);

  private readonly range = computed(() => {
    const values = this.series().flatMap(s => s.values).filter((v): v is number => v !== null);
    if (!values.length) return { min: 0, max: 1 };
    let min = this.zeroBased() ? 0 : Math.min(...values);
    let max = Math.max(...values);
    if (max === min) max = min + 1;
    // Round the top to a clean step so the tick labels are readable numbers.
    const step = this.niceStep((max - min) / 3);
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;
    return { min, max, step };
  });

  private niceStep(raw: number): number {
    const pow = 10 ** Math.floor(Math.log10(raw || 1));
    const n = raw / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  }

  x(index: number): number {
    const n = this.labels().length;
    return n <= 1 ? (PAD.left + W - PAD.right) / 2 : PAD.left + index * (W - PAD.left - PAD.right) / (n - 1);
  }

  private y(value: number): number {
    const { min, max } = this.range();
    return PAD.top + (1 - (value - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  }

  readonly ticks = computed(() => {
    const { min, max } = this.range();
    const step = (this.range() as any).step ?? (max - min) / 3;
    const out: { value: number; y: number }[] = [];
    for (let v = min; v <= max + step / 1000; v += step) out.push({ value: +v.toFixed(4), y: this.y(v) });
    return out;
  });

  readonly paths = computed(() => {
    const active = this.active();
    return this.series().map(s => {
      let d = '';
      let pen = false;
      s.values.forEach((v, i) => {
        if (v === null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${this.x(i).toFixed(1)} ${this.y(v).toFixed(1)} `;
        pen = true;
      });
      const v = s.values[active];
      return {
        name: s.name, slot: s.slot ?? 1, d: d.trim(),
        dot: v === null || v === undefined ? null : { x: this.x(active), y: this.y(v) }
      };
    });
  });

  readonly summary = computed(() => {
    const labels = this.labels();
    const parts = this.series().map(s => {
      const values = s.values.filter((v): v is number => v !== null);
      return values.length ? `${s.name} von ${values[0]} bis ${values[values.length - 1]}` : s.name;
    });
    return `${this.title() || 'Verlauf'}, ${labels[0]} bis ${labels[labels.length - 1]}: ${parts.join('; ')}`;
  });

  pick(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width * W;
    const n = this.labels().length;
    if (n <= 1) return;
    const index = Math.round((px - PAD.left) / ((W - PAD.left - PAD.right) / (n - 1)));
    this.hover.set(Math.max(0, Math.min(n - 1, index)));
  }
}
