import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LiveComponent, liveToGame } from './live.component';
import { LiveTickerService } from '../../services/live-ticker/live-ticker.service';
import { TickerStub } from '../../testing/ticker.stub';
import { LiveGame } from '../../models/live';

const base = { Season: 2026, LeagueID: 9, Gruppe: '', LeagueKind: 'V', LeagueName: 'Testliga' };
const GAMES: LiveGame[] = [
  { ...base, GameID: 1, HomeClubname: 'Alpha', GuestClubname: 'Beta', LiveShortText: '5:4', ScoreText: '5:4', StartDate: '2026-11-16T18:00:00' },
  { ...base, GameID: 2, HomeClubname: 'Gamma', GuestClubname: 'Delta', LiveShortText: 'So 09:00 Uhr', StartDate: '2026-11-22T09:00:00' },
  { ...base, GameID: 3, HomeClubname: 'Eta', GuestClubname: 'Zeta', LiveShortCSS: 'black', LiveShortText: '3:10', ScoreText: '3:10', StartDate: '2026-11-16T12:00:00' }
];

describe('LiveComponent', () => {
  let fixture: ComponentFixture<LiveComponent>;
  let component: LiveComponent;
  let ticker: TickerStub;

  beforeEach(() => {
    ticker = new TickerStub();
    TestBed.configureTestingModule({
      imports: [LiveComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: LiveTickerService, useValue: ticker }]
    });
    fixture = TestBed.createComponent(LiveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps the ticker connected while visible', () => {
    expect(ticker.retain).toHaveBeenCalled();
    fixture.destroy();
    expect(ticker.release).toHaveBeenCalled();
  });

  it('shows an empty state without games', () => {
    expect(fixture.nativeElement.textContent).toContain('Ruhe im Becken');
  });

  it('sorts games into live, upcoming and finished', () => {
    ticker.liveGames.set(GAMES);
    fixture.detectChanges();
    expect(component.liveNow().map(r => r.game.home)).toEqual(['Alpha']);
    expect(component.upcoming().map(r => r.game.home)).toEqual(['Gamma']);
    expect(component.finished().map(r => r.game.home)).toEqual(['Eta']);
    expect(fixture.nativeElement.textContent).toContain('Jetzt im Wasser');
  });

  it('maps a ticker game to a game with links into the app', () => {
    const game = liveToGame(GAMES[0], 'live', '5:4');
    expect(game.result).toBe('5:4');
    expect(game.gameLink).toBe('Game.aspx?Season=2026&LeagueID=9&Group=&LeagueKind=V&GameID=1');
    expect(liveToGame(GAMES[1], 'upcoming', '0:0').result).toBe(' - ');
    expect(component.liveNow().length).toBe(0);
  });
});
