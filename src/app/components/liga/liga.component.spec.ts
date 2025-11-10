import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LigaComponent } from './liga.component';
import { LigaService } from '../../services/liga/liga.service';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Games } from '../../models/games';
import { Table } from '../../models/table';
import { Scorer } from '../../models/scorer';

describe('LigaComponent', () => {
  let component: LigaComponent;
  let fixture: ComponentFixture<LigaComponent>;
  let ligaService: jasmine.SpyObj<LigaService>;
  let router: jasmine.SpyObj<Router>;
  let activatedRoute: any;

  const mockGames: Games[] = [
    {
      start: '10.11.2025, 18:00 Uhr',
      home: 'Team A',
      homeImageUrl: 'imageA.png',
      guest: 'Team B',
      guestImageUrl: 'imageB.png',
      location: 'Berlin',
      gameLink: 'Game.aspx?id=123',
      result: '10:8'
    },
    {
      start: '11.11.2025, 19:00 Uhr',
      home: 'Team C',
      homeImageUrl: 'imageC.png',
      guest: 'Team D',
      guestImageUrl: 'imageD.png',
      location: 'Hamburg',
      gameLink: '',
      result: ' - '
    }
  ];

  const mockTable: Table[] = [
    {
      place: 1,
      team: 'Team A',
      info: '',
      imageUrl: 'imageA.png',
      games: 10,
      wins: 8,
      draws: 1,
      losses: 1,
      goals: '100:70',
      goalDifference: 30,
      points: 17
    }
  ];

  const mockScorers: Scorer[] = [
    {
      place: 1,
      name: 'Spieler A',
      team: 'Team A',
      goals: 25,
      games: 10
    }
  ];

  beforeEach(async () => {
    const ligaServiceSpy = jasmine.createSpyObj('LigaService', [
      'getItems',
      'getLigaName',
      'parseHtmlToGames',
      'parseHtmlToTable',
      'parseHtmlToScorer',
      'getLocationLink'
    ]);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    activatedRoute = {
      queryParams: of({ param: 'WBGameList.aspx?V=DMOL2B&S=2025' }),
      snapshot: {
        queryParams: { param: 'WBGameList.aspx?V=DMOL2B&S=2025' }
      }
    };

    await TestBed.configureTestingModule({
      imports: [
        LigaComponent,
        HttpClientTestingModule,
        BrowserAnimationsModule
      ],
      providers: [
        { provide: LigaService, useValue: ligaServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: activatedRoute }
      ]
    })
    .compileComponents();

    ligaService = TestBed.inject(LigaService) as jasmine.SpyObj<LigaService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    // Setup default mock responses
    ligaService.getItems.and.returnValue(of('<html></html>'));
    ligaService.getLigaName.and.returnValue('Test Liga');
    ligaService.parseHtmlToGames.and.returnValue(mockGames);
    ligaService.parseHtmlToTable.and.returnValue(mockTable);
    ligaService.parseHtmlToScorer.and.returnValue(mockScorers);
    ligaService.getLocationLink.and.returnValue(Promise.resolve('https://maps.google.com'));

    fixture = TestBed.createComponent(LigaComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load liga data on initialization', () => {
      fixture.detectChanges();

      expect(ligaService.getItems).toHaveBeenCalled();
      expect(component.ligaName).toBe('Test Liga');
      expect(component.dataSourceGames.data.length).toBe(2);
      expect(component.dataSourceTable.data.length).toBe(1);
      expect(component.dataSourceScorer.data.length).toBe(1);
      expect(component.isLoading).toBe(false);
    });

    it('should extract liga parameter from query params', () => {
      fixture.detectChanges();

      expect(ligaService.getItems).toHaveBeenCalledWith('WBGameList.aspx?V=DMOL2B&S=2025');
    });
  });

  describe('applyGamesFilter', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should filter games by team name', () => {
      const event = { target: { value: 'Team A' } } as any;
      component.applyGamesFilter(event);

      expect(component.dataSourceGames.filter).toBe('team a');
    });

    it('should trim whitespace from filter', () => {
      const event = { target: { value: '  Team A  ' } } as any;
      component.applyGamesFilter(event);

      expect(component.dataSourceGames.filter).toBe('team a');
    });
  });

  describe('applyScorerFilter', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should filter scorers by name', () => {
      const event = { target: { value: 'Spieler A' } } as any;
      component.applyScorerFilter(event);

      expect(component.dataSourceScorer.filter).toBe('spieler a');
    });
  });

  describe('checkEventInPast', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should return true for past events', () => {
      const pastDate = '01.01.20, 10:00 Uhr';
      expect(component.checkEventInPast(pastDate)).toBe(true);
    });

    it('should return false for future events', () => {
      const futureDate = '01.01.30, 10:00 Uhr';
      expect(component.checkEventInPast(futureDate)).toBe(false);
    });

    it('should handle invalid date format', () => {
      const invalidDate = 'invalid date';
      expect(() => component.checkEventInPast(invalidDate)).not.toThrow();
      expect(component.checkEventInPast(invalidDate)).toBe(false);
    });

    it('should handle empty string', () => {
      expect(component.checkEventInPast('')).toBe(false);
    });
  });

  describe('isGameWon', () => {
    it('should return true when home team wins', () => {
      const game: Games = {
        start: '',
        home: 'Team A',
        homeImageUrl: '',
        guest: 'Team B',
        guestImageUrl: '',
        location: '',
        gameLink: '',
        result: '10:8'
      };

      expect(component.isGameWon(game, 'Team A')).toBe(true);
      expect(component.isGameWon(game, 'Team B')).toBe(false);
    });

    it('should return true when guest team wins', () => {
      const game: Games = {
        start: '',
        home: 'Team A',
        homeImageUrl: '',
        guest: 'Team B',
        guestImageUrl: '',
        location: '',
        gameLink: '',
        result: '8:10'
      };

      expect(component.isGameWon(game, 'Team B')).toBe(true);
      expect(component.isGameWon(game, 'Team A')).toBe(false);
    });
  });

  describe('isGameLost', () => {
    it('should return true when home team loses', () => {
      const game: Games = {
        start: '',
        home: 'Team A',
        homeImageUrl: '',
        guest: 'Team B',
        guestImageUrl: '',
        location: '',
        gameLink: '',
        result: '8:10'
      };

      expect(component.isGameLost(game, 'Team A')).toBe(true);
      expect(component.isGameLost(game, 'Team B')).toBe(false);
    });
  });

  describe('isGameDraw', () => {
    it('should return true for draw', () => {
      const game: Games = {
        start: '',
        home: 'Team A',
        homeImageUrl: '',
        guest: 'Team B',
        guestImageUrl: '',
        location: '',
        gameLink: '',
        result: '10:10'
      };

      expect(component.isGameDraw(game)).toBe(true);
    });

    it('should return false for non-draw', () => {
      const game: Games = {
        start: '',
        home: 'Team A',
        homeImageUrl: '',
        guest: 'Team B',
        guestImageUrl: '',
        location: '',
        gameLink: '',
        result: '10:8'
      };

      expect(component.isGameDraw(game)).toBe(false);
    });

    it('should return false for no result', () => {
      const game: Games = {
        start: '',
        home: 'Team A',
        homeImageUrl: '',
        guest: 'Team B',
        guestImageUrl: '',
        location: '',
        gameLink: '',
        result: ' - '
      };

      expect(component.isGameDraw(game)).toBe(false);
    });
  });

  describe('navigateToGameDetails', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should navigate to game details with correct link', () => {
      const game: Games = {
        start: '',
        home: 'A',
        homeImageUrl: '',
        guest: 'B',
        guestImageUrl: '',
        location: '',
        gameLink: 'Game.aspx?id=123',
        result: '10:8'
      };

      component.navigateToGameDetails(game);

      expect(router.navigate).toHaveBeenCalledWith(['/game-details'], {
        queryParams: { param: 'Game.aspx?id=123' }
      });
    });

    it('should not navigate when gameLink is empty', () => {
      const game: Games = {
        start: '',
        home: 'A',
        homeImageUrl: '',
        guest: 'B',
        guestImageUrl: '',
        location: '',
        gameLink: '',
        result: ' - '
      };

      component.navigateToGameDetails(game);

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('navigateToMapsLink', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should call ligaService.getLocationLink and open in new tab', async () => {
      const game: Games = {
        start: '',
        home: 'A',
        homeImageUrl: '',
        guest: 'B',
        guestImageUrl: '',
        location: 'Berlin',
        gameLink: 'Game.aspx?id=123',
        result: '10:8'
      };

      const event = new Event('click');
      spyOn(event, 'preventDefault');
      spyOn(event, 'stopPropagation');
      spyOn(window, 'open');

      ligaService.getLocationLink.and.returnValue(Promise.resolve('https://maps.google.com'));

      await component.navigateToMapsLink(game, event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(ligaService.getLocationLink).toHaveBeenCalledWith('Game.aspx?id=123');
      expect(window.open).toHaveBeenCalledWith('https://maps.google.com', '_blank');
    });

    it('should not open window when location link is empty', async () => {
      const game: Games = {
        start: '',
        home: 'A',
        homeImageUrl: '',
        guest: 'B',
        guestImageUrl: '',
        location: 'Berlin',
        gameLink: 'Game.aspx?id=123',
        result: '10:8'
      };

      const event = new Event('click');
      spyOn(window, 'open');

      ligaService.getLocationLink.and.returnValue(Promise.resolve(''));

      await component.navigateToMapsLink(game, event);

      expect(window.open).not.toHaveBeenCalled();
    });
  });

  describe('getGamesByRow', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should filter games for specific team', () => {
      const tableRow = mockTable[0];

      component.getGamesByRow(tableRow);

      // expandedGames should contain games with results for this team
      expect(component.expandedGames).toBeDefined();
    });
  });

  describe('groupGamesByMatchday', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should group games by matchday', () => {
      component.groupGamesByMatchday();

      expect(component.groupedGames).toBeDefined();
      expect(component.groupedGames instanceof Map).toBe(true);
    });
  });
});
