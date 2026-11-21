import { Games } from './games';
import { dayKey, dayLabel, formOf, isPlayed, outcomeFor, parseGameDate, parseScore } from './game-utils';
import { buildIcs } from './ics';

const game = (over: Partial<Games>): Games => ({
    start: '02.10.26, 20:30 Uhr', home: 'A', homeImageUrl: '', guest: 'B', guestImageUrl: '',
    location: 'Bad, Stadt', gameLink: '', result: ' - ', ...over
});

describe('game-utils', () => {
    it('parses the DSV list, report and ticker date formats', () => {
        expect(parseGameDate('02.10.26, 20:30 Uhr')).toEqual(new Date(2026, 9, 2, 20, 30));
        expect(parseGameDate('02.10.2026 20:30 Uhr')).toEqual(new Date(2026, 9, 2, 20, 30));
        expect(parseGameDate('2026-10-02T20:30:00')).toEqual(new Date(2026, 9, 2, 20, 30));
        expect(parseGameDate('03.10.26')).toEqual(new Date(2026, 9, 3));
        expect(parseGameDate('')).toBeNull();
        expect(parseGameDate('irgendwann')).toBeNull();
    });

    it('recognises final scores only', () => {
        expect(parseScore('17:8')).toEqual([17, 8]);
        expect(parseScore(' - ')).toBeNull();
        expect(parseScore('mehr...')).toBeNull();
        expect(isPlayed(game({ result: '5:5' }))).toBe(true);
        expect(isPlayed(game({}))).toBe(false);
    });

    it('reports the outcome from a team\'s point of view', () => {
        const g = game({ result: '10:7' });
        expect(outcomeFor(g, 'A')).toBe('W');
        expect(outcomeFor(g, 'B')).toBe('L');
        expect(outcomeFor(game({ result: '7:7' }), 'B')).toBe('D');
        expect(outcomeFor(g, 'C')).toBeNull();
        expect(outcomeFor(game({}), 'A')).toBeNull();
    });

    it('builds the form with the latest game first', () => {
        const games = [
            game({ start: '01.10.26, 18:00 Uhr', result: '10:7' }),
            game({ start: '08.10.26, 18:00 Uhr', result: '3:9' }),
            game({ start: '15.10.26, 18:00 Uhr' })
        ];
        expect(formOf(games, 'A')).toEqual(['L', 'W']);
    });

    it('labels days relative to today', () => {
        const now = new Date(2026, 9, 2, 12);
        expect(dayLabel(new Date(2026, 9, 2, 20), now)).toBe('Heute');
        expect(dayLabel(new Date(2026, 9, 3, 9), now)).toBe('Morgen');
        expect(dayLabel(new Date(2026, 9, 10), now)).toBe('Sa, 10. Okt.');
        expect(dayLabel(new Date(2027, 0, 9), now)).toBe('Sa, 9. Jan. 2027');
        expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('exports games as iCalendar with escaped text', () => {
        const ics = buildIcs([game({}), game({ start: 'offen' })], 'Liga, Nord');
        expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(1);
        expect(ics).toContain('DTSTART:20261002T203000');
        expect(ics).toContain('DTEND:20261002T220000');
        expect(ics).toContain('LOCATION:Bad\\, Stadt');
        expect(ics).toContain('DESCRIPTION:Wasserball\\, Liga\\, Nord');
    });
});

import { teamInitial } from './game-utils';

describe('teamInitial', () => {
    it('skips club prefixes and years', () => {
        expect(teamInitial('SV 1957 Georgsmarienhütte')).toBe('G');
        expect(teamInitial('SG Wassersport Iserlohn')).toBe('W');
        expect(teamInitial('1. FC Nürnberg')).toBe('N');
        expect(teamInitial('SSV Esslingen')).toBe('E');
        expect(teamInitial('OSC')).toBe('O');
        expect(teamInitial('')).toBe('?');
    });
});
