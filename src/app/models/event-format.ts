/**
 * Shared formatting for water-polo game events and personal fouls, used by both
 * the live ticker and the game-detail/protocol views so codes are never shown
 * raw to the user.
 */

const EVENT_LABELS: Record<string, string> = {
    T: 'Tor',
    A: 'Ausschluss',
    AmE: 'Ausschluss mit Ersatz',
    'AmE+4': 'Ausschluss mit Ersatz',
    AU: 'Auszeit',
    S: 'Strafwurf',
    P: 'Penalty',
    TO: 'Timeout',
    KT: 'Kapitän',
    GK: 'Torwart',
    RK: 'Rote Karte',
    E: 'Einwechslung',
    X: 'Sonstiges',
    '5m': '5m-Wurf',
    Goal: 'Tor',
    Penalty: 'Penalty',
    Exclusion: 'Ausschluss',
    Timeout: 'Timeout'
};

const EVENT_ICONS: Record<string, string> = {
    T: 'sports_handball',
    A: 'pan_tool',
    AmE: 'pan_tool',
    'AmE+4': 'pan_tool',
    AU: 'timer',
    S: 'sports_score',
    P: 'flag',
    TO: 'timer',
    KT: 'star',
    GK: 'sports_kabaddi',
    RK: 'dangerous',
    E: 'swap_horiz',
    '5m': 'sports_handball',
    Goal: 'sports_handball',
    Penalty: 'flag',
    Exclusion: 'pan_tool',
    Timeout: 'timer'
};

/** Strip the trailing "f." DSV adds (e.g. "Strafwurff." → "Strafwurf"). */
function clean(code: string): string {
    return (code || '').replace(/f\.$/, '').trim();
}

export function eventLabel(code: string): string {
    return EVENT_LABELS[code] ?? clean(code) ?? code;
}

export function eventIcon(code: string): string {
    return EVENT_ICONS[code] ?? 'fiber_manual_record';
}

export function isGoalEvent(code: string): boolean {
    return code === 'T' || code === 'Goal';
}

/** Personal foul code shown in lineup tables. */
export function foulLabel(code: string): string {
    if (code === 'S') return 'Strafwurf';
    if (code === 'A') return 'Ausschluss';
    return code;
}
