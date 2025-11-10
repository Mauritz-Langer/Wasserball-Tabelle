import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameDetailsComponent } from './game-details.component';
import { GameDetailsService } from '../../services/game-details/game-details.service';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { GameDetails } from '../../models/game-details';

describe('GameDetailsComponent', () => {
  let component: GameDetailsComponent;
  let fixture: ComponentFixture<GameDetailsComponent>;
  let gameDetailsService: jasmine.SpyObj<GameDetailsService>;
  let router: jasmine.SpyObj<Router>;
  let activatedRoute: any;

  const mockGameDetails: GameDetails = {
    gameId: '12345',
    league: 'Bundesliga',
    startDate: '10.11.2025 18:00',
    playKind: 'Meisterschaft',
    homeTeam: {
      name: 'Team A',
      logoUrl: 'logoA.png',
      coach: 'Trainer A',
      captain: 'Kapitän A',
      bestPlayer: 'Bester A'
    },
    guestTeam: {
      name: 'Team B',
      logoUrl: 'logoB.png',
      coach: 'Trainer B',
      captain: 'Kapitän B',
      bestPlayer: 'Bester B'
    },
    finalScore: '10:8',
    scoringSystem: '4x8 Min.',
    quarterScores: [
      { quarter: 1, home: 3, guest: 2 },
      { quarter: 2, home: 2, guest: 2 },
      { quarter: 3, home: 3, guest: 2 },
      { quarter: 4, home: 2, guest: 2 }
    ],
    venue: {
      poolName: 'Schwimmhalle',
      poolCity: 'Berlin',
      googleMapsLink: 'https://maps.google.com'
    },
    officials: {
      referee1: 'Schiri 1',
      referee2: 'Schiri 2',
      timekeeper1: 'Zeitnehmer',
      secretary1: 'Sekretär'
    },
    events: []
  };

  beforeEach(async () => {
    const gameDetailsServiceSpy = jasmine.createSpyObj('GameDetailsService', [
      'getGameData',
      'parseHtmlToGameDetails'
    ]);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    activatedRoute = {
      queryParams: of({ param: 'Game.aspx?id=123' })
    };

    await TestBed.configureTestingModule({
      imports: [
        GameDetailsComponent,
        HttpClientTestingModule,
        BrowserAnimationsModule
      ],
      providers: [
        { provide: GameDetailsService, useValue: gameDetailsServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: activatedRoute }
      ]
    })
    .compileComponents();

    gameDetailsService = TestBed.inject(GameDetailsService) as jasmine.SpyObj<GameDetailsService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    // Setup default mock responses
    gameDetailsService.getGameData.and.returnValue(of('<html></html>'));
    gameDetailsService.parseHtmlToGameDetails.and.returnValue(mockGameDetails);

    // Mock window.open globally to prevent full page reloads in any test
    spyOn(window, 'open');

    fixture = TestBed.createComponent(GameDetailsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load game details on initialization', () => {
      fixture.detectChanges();

      expect(gameDetailsService.getGameData).toHaveBeenCalledWith('Game.aspx?id=123');
      expect(gameDetailsService.parseHtmlToGameDetails).toHaveBeenCalled();
      expect(component.gameDetails).toEqual(mockGameDetails);
      expect(component.isLoading).toBe(false);
      expect(component.error).toBeNull();
    });

    it('should handle missing param', () => {
      activatedRoute.queryParams = of({});
      const newFixture = TestBed.createComponent(GameDetailsComponent);
      const newComponent = newFixture.componentInstance;

      newFixture.detectChanges();

      expect(newComponent.error).toBe('Keine Spiel-ID angegeben');
      expect(newComponent.isLoading).toBe(false);
    });

    it('should handle HTTP error', () => {
      gameDetailsService.getGameData.and.returnValue(
        throwError(() => new Error('Network error'))
      );

      fixture.detectChanges();

      expect(component.error).toBe('Fehler beim Laden der Spieldetails');
      expect(component.isLoading).toBe(false);
    });

    it('should handle parsing error', () => {
      gameDetailsService.parseHtmlToGameDetails.and.throwError('Parse error');

      fixture.detectChanges();

      expect(component.error).toBe('Fehler beim Laden der Spieldetails');
      expect(component.isLoading).toBe(false);
    });
  });

  describe('goBack', () => {
    it('should navigate back to liga with ligaParam', () => {
      activatedRoute.snapshot = { queryParams: { ligaParam: 'WBGameList.aspx?V=DMOL2B&S=2025' } };
      fixture.detectChanges();

      component.goBack();

      expect(router.navigate).toHaveBeenCalledWith(['/liga'], {
        queryParams: { param: 'WBGameList.aspx?V=DMOL2B&S=2025' }
      });
    });

    it('should navigate to overview when no ligaParam', () => {
      activatedRoute.snapshot = { queryParams: {} };
      fixture.detectChanges();

      component.goBack();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });
  });

  describe('openGoogleMaps', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should open map link in new window', () => {
      component.gameDetails = {
        ...mockGameDetails,
        venue: { ...mockGameDetails.venue!, googleMapsLink: 'https://maps.google.com' }
      };

      component.openGoogleMaps();

      expect(window.open).toHaveBeenCalledWith('https://maps.google.com', '_blank');
    });

    it('should not open when no map link', () => {
      component.gameDetails = {
        ...mockGameDetails,
        venue: { poolName: 'Pool', poolCity: 'City', googleMapsLink: '' }
      };

      component.openGoogleMaps();

      expect(window.open).not.toHaveBeenCalled();
    });
  });

  describe('downloadProtocol', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should open protocol link', () => {
      component.gameDetails = { ...mockGameDetails, protocolLink: 'protocol.pdf' };

      component.downloadProtocol();

      expect(window.open).toHaveBeenCalledWith('protocol.pdf', '_blank');
    });
  });

  describe('openVideoLink', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should open video link', () => {
      component.gameDetails = { ...mockGameDetails, videoLink: 'https://video.com' };

      component.openVideoLink();

      expect(window.open).toHaveBeenCalledWith('https://video.com', '_blank');
    });
  });

  describe('getEventTypeName', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should return correct name for Tor', () => {
      expect(component.getEventTypeName('T')).toBe('Tor');
    });

    it('should return correct name for Ausschluss', () => {
      expect(component.getEventTypeName('A')).toBe('Ausschluss');
    });

    it('should return original value for unknown type', () => {
      expect(component.getEventTypeName('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('hasOfficials', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should return true when officials exist', () => {
      component.gameDetails = mockGameDetails;
      expect(component.hasOfficials()).toBe(true);
    });

    it('should return false when no officials', () => {
      component.gameDetails = {
        ...mockGameDetails,
        officials: { referee1: '', referee2: '', timekeeper1: '', secretary1: '' }
      };
      expect(component.hasOfficials()).toBe(false);
    });
  });

  describe('Quarter Scores Display', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should display all quarter scores', () => {
      expect(component.gameDetails?.quarterScores.length).toBe(4);
    });

    it('should calculate cumulative scores correctly', () => {
      const quarters = component.gameDetails?.quarterScores || [];
      let homeTotal = 0;
      let guestTotal = 0;

      quarters.forEach(q => {
        homeTotal += q.home;
        guestTotal += q.guest;
      });

      expect(homeTotal).toBe(10);
      expect(guestTotal).toBe(8);
    });
  });

  describe('Team Information', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should display home team information', () => {
      expect(component.gameDetails?.homeTeam.name).toBe('Team A');
      expect(component.gameDetails?.homeTeam.coach).toBe('Trainer A');
      expect(component.gameDetails?.homeTeam.captain).toBe('Kapitän A');
    });

    it('should display guest team information', () => {
      expect(component.gameDetails?.guestTeam.name).toBe('Team B');
      expect(component.gameDetails?.guestTeam.coach).toBe('Trainer B');
      expect(component.gameDetails?.guestTeam.captain).toBe('Kapitän B');
    });
  });
});

