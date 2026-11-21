import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TeamIndexService, baseLeagueName, clubKey, teamRows } from './team-index.service';
import { SubItem } from '../../models/subItem';

const current: SubItem[] = [
  { name: 'Wasserball Bundesliga Männer Vorrunde', gender: 'männlich', link: 'L1', isFavorite: false },
  { name: '2. Wasserball Bundesliga Männer Vorrunde', gender: 'männlich', link: 'L2', isFavorite: false },
  { name: 'Oberliga Nord Gruppe B', gender: 'männlich', link: 'L3', isFavorite: false }
];

describe('TeamIndexService', () => {
  let service: TeamIndexService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(TeamIndexService);
    http = TestBed.inject(HttpTestingController);
  });

  function answer() {
    http.expectOne('assets/data/archive/teams.json').flush({
      season: '2025',
      teams: {
        'Wfr. Spandau 04': ['Wasserball Bundesliga Männer Vorrunde', 'Wasserball Bundesliga Männer Playoffs'],
        'SV Spandau II': ['Oberliga Nord Gruppe A'],
        'OSC Potsdam': ['Landesliga Brandenburg']
      }
    });
  }

  it('reduces league names to their competition', () => {
    expect(baseLeagueName('Wasserball Bundesliga Männer Playoff A Playoffs')).toBe('wasserball bundesliga manner');
    expect(baseLeagueName('Oberliga Nord Gruppe B')).toBe('oberliga nord');
    expect(baseLeagueName('Deutscher Pokal U14 Vorrunde 2')).toBe('deutscher pokal u14');
  });

  it('finds teams and the leagues of this season they probably play in', async () => {
    const pending = service.search('spandau', current);
    answer();
    const hits = await pending;
    expect(hits.map(h => h.team)).toEqual(['SV Spandau II', 'Wfr. Spandau 04']);
    expect(hits.find(h => h.team === 'Wfr. Spandau 04')!.leagues.map(l => l.link)).toEqual(['L1']);
    // no exact name this season: matched by competition (other group)
    expect(hits.find(h => h.team === 'SV Spandau II')!.leagues.map(l => l.link)).toEqual(['L3']);
  });

  it('reports teams whose league has not started yet without leagues', async () => {
    const pending = service.search('potsdam', current);
    answer();
    expect(await pending).toEqual([{ team: 'OSC Potsdam', leagues: [] }]);
  });

  it('lists a club once per league it plays in', () => {
    const rows = teamRows([
      { team: 'SSV Esslingen', leagues: [current[0], current[1]] },
      { team: 'OSC Potsdam', leagues: [] }
    ]);
    expect(rows.map(r => [r.team, r.league?.link ?? null])).toEqual([
      ['SSV Esslingen', 'L1'], ['SSV Esslingen', 'L2'], ['OSC Potsdam', null]
    ]);
  });

  it('ignores queries shorter than two letters', async () => {
    expect(await service.search('s', current)).toEqual([]);
    http.expectNone('assets/data/archive/teams.json');
  });

  it('reduces team names to the club', () => {
    expect(clubKey('SV Krefeld 72 II')).toBe('sv krefeld 72');
    expect(clubKey('SG Neukölln 3')).toBe('sg neukolln');
    expect(clubKey('Wfr. Spandau 04')).toBe('wfr. spandau 04');
  });

  it('looks up archive logos by team and by club', async () => {
    expect(service.logoFor('Wfr. Spandau 04')).toBe('');
    http.expectOne('assets/data/archive/teams.json').flush({
      season: '2025', teams: {}, logos: { 'Wfr. Spandau 04': 'abc123' }
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(service.logoFor('Wfr. Spandau 04')).toBe('assets/data/archive/logos/abc123.svg');
    expect(service.logoFor('Wfr. Spandau 04 II')).toBe('assets/data/archive/logos/abc123.svg');
    expect(service.logoFor('OSC Potsdam')).toBe('');
  });
});
