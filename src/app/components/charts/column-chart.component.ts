import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface Column { label: string; value: number; }

/** Above this many bars the values move from the bars into the readout line. */
const LABELLED_MAX = 9;

/**
 * Vertical bars for a handful of categories (goal ranges, months, seasons).
 * Few bars carry their value on top; with many bars the value of the bar
 * under the finger / cursor (the latest by default) is shown above the chart.
 * Bars always start at zero.
 */
@Component({
  selector: 'app-column-chart',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!labelled()) {
      <div class="readout" aria-hidden="true">
        <span class="at">{{ bars()[active()]?.label }}</span>
        <span class="val"><i class="swatch"></i><b class="num">{{ bars()[active()]?.value | number: format() }}</b>{{ unit() }}</span>
      </div>
    }
    <div class="columns" role="img" [attr.aria-label]="summary()" (pointerleave)="hover.set(null)">
      @for (c of bars(); track c.label; let i = $index) {
        <div class="col" [class.on]="!labelled() && i === active()"
          (pointerenter)="hover.set(i)" (pointerdown)="hover.set(i)">
          @if (labelled()) { <span class="col-value num">{{ c.value | number: format() }}</span> }
          <span class="col-track"><i [style.height.%]="c.share"></i></span>
          <span class="col-label num" [class.skip]="!showLabel(i)">{{ c.label }}</span>
        </div>
      }
    </div>
  `,
  styleUrl: './charts.scss'
})
export class ColumnChartComponent {
  readonly columns = input.required<Column[]>();
  readonly unit = input('');
  readonly decimals = input(0);
  readonly title = input('');

  readonly hover = signal<number | null>(null);
  readonly format = computed(() => `1.${this.decimals()}-${this.decimals()}`);
  readonly labelled = computed(() => this.columns().length <= LABELLED_MAX);
  readonly active = computed(() => this.hover() ?? this.columns().length - 1);

  readonly bars = computed(() => {
    const max = Math.max(1, ...this.columns().map(c => c.value));
    return this.columns().map(c => ({ ...c, share: c.value > 0 ? Math.max(2, c.value / max * 100) : 0 }));
  });

  /** With many bars every other label is left out (always keep the last). */
  showLabel(i: number): boolean {
    const n = this.columns().length;
    if (n <= LABELLED_MAX) return true;
    const step = Math.ceil(n / 6);
    return (n - 1 - i) % step === 0;
  }

  readonly summary = computed(() =>
    `${this.title()}: ` + this.columns().map(c => `${c.label} ${c.value}${this.unit()}`).join(', '));
}
