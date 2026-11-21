import { computed, signal } from '@angular/core';
import { LiveGame, LivePlay } from '../models/live';
import { liveGameKey } from '../models/game-ref';

/** Network-free stand-in for LiveTickerService in component tests. */
export class TickerStub {
  readonly state = signal<'idle' | 'connecting' | 'connected' | 'error'>('connected');
  readonly liveGames = signal<LiveGame[]>([]);
  readonly plays = signal<LivePlay[]>([]);
  readonly clock = signal('');
  readonly currentGame = signal<LiveGame | null>(null);
  readonly byKey = computed(() => new Map(this.liveGames().map(g => [liveGameKey(g), g])));
  readonly liveNowKeys = computed(() =>
    new Set(this.liveGames().filter(g => this.statusOf(g) === 'live').map(g => liveGameKey(g))));

  retain = vi.fn();
  release = vi.fn();
  connect = vi.fn().mockResolvedValue(undefined);
  unwatch = vi.fn();
  watchByKey = vi.fn().mockResolvedValue(true);

  statusOf(g: LiveGame): 'live' | 'finished' | 'upcoming' {
    if (g.LiveShortCSS === 'black') return 'finished';
    return /^\d+\s*:\s*\d+$/.test(g.LiveShortText || '') ? 'live' : 'upcoming';
  }

  scoreOf(g: LiveGame): string {
    return g.ScoreText || '0:0';
  }
}
