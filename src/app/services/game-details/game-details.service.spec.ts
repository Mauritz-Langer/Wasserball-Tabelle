import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { GameDetailsService } from './game-details.service';
import { ApiProxyService } from '../api-proxy/api-proxy.service';
import { GameDetails } from '../../models/game-details';

describe('GameDetailsService', () => {
  let service: GameDetailsService;
  let httpMock: HttpTestingController;
  let apiProxyService: ApiProxyService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [GameDetailsService, ApiProxyService]
    });
    service = TestBed.inject(GameDetailsService);
    httpMock = TestBed.inject(HttpTestingController);
    apiProxyService = TestBed.inject(ApiProxyService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getGameData', () => {
    it('should fetch game data via HTTP', () => {
      const mockLink = 'Game.aspx?Season=2025&LeagueID=298&GameID=123';
      const mockHtml = '<html><body>Game Data</body></html>';

      service.getGameData(mockLink).subscribe(data => {
        expect(data).toBe(mockHtml);
      });

      const expectedUrl = apiProxyService.getApiUrl('/Modules/WB/' + mockLink);
      const req = httpMock.expectOne(expectedUrl);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('text');
      req.flush(mockHtml);
    });
  });

  describe('parseHtmlToGameDetails', () => {
    it('should parse basic game information', () => {
      const html = `
        <html><body>
          <span id="ContentSection__gameidLabel">12345</span>
          <span id="ContentSection__leagueLabel">Bundesliga</span>
          <span id="ContentSection__startdateLabel">10.11.2025 18:00</span>
          <span id="ContentSection__playkindLabel">Meisterschaft</span>
          <span id="ContentSection__scoreLabel">10:8</span>
        </body></html>
      `;

      const result = service.parseHtmlToGameDetails(html);

      expect(result.gameId).toBe('12345');
      expect(result.league).toBe('Bundesliga');
      expect(result.startDate).toBe('10.11.2025 18:00');
      expect(result.playKind).toBe('Meisterschaft');
    });

    it('should parse team details', () => {
      const html = `
        <html><body>
          <span id="ContentSection__gameidLabel">123</span>
          <span id="ContentSection__whiteTeamLabel">SV Weiß</span>
          <span id="ContentSection__blueTeamLabel">SV Blau</span>
          <span id="ContentSection__whiteCoachLabel">Trainer A</span>
          <span id="ContentSection__blueCoachLabel">Trainer B</span>
          <span id="ContentSection__whiteCaptainLabel">Kapitän A</span>
          <span id="ContentSection__blueCaptainLabel">Kapitän B</span>
          <span id="ContentSection__whiteBestLabel">Bester A</span>
          <span id="ContentSection__blueBestLabel">Bester B</span>
        </body></html>
      `;

      const result = service.parseHtmlToGameDetails(html);

      expect(result.homeTeam.name).toBe('SV Weiß');
      expect(result.homeTeam.coach).toBe('Trainer A');
      expect(result.homeTeam.captain).toBe('Kapitän A');
      expect(result.homeTeam.bestPlayer).toBe('Bester A');

      expect(result.guestTeam.name).toBe('SV Blau');
      expect(result.guestTeam.coach).toBe('Trainer B');
      expect(result.guestTeam.captain).toBe('Kapitän B');
      expect(result.guestTeam.bestPlayer).toBe('Bester B');
    });

    it('should parse venue information', () => {
      const html = `
        <html><body>
          <span id="ContentSection__poolLabel">Schwimmhalle Nord</span>
          <span id="ContentSection__cityLabel">Berlin</span>
          <a id="ContentSection__googleHyperLink" href="https://maps.google.com/?q=Berlin">Map</a>
        </body></html>
      `;

      const result = service.parseHtmlToGameDetails(html);

      expect(result.venue?.poolName).toBe('Schwimmhalle Nord');
      expect(result.venue?.poolCity).toBe('Berlin');
      expect(result.venue?.googleMapsLink).toBe('https://maps.google.com/?q=Berlin');
    });

    it('should parse officials', () => {
      const html = `
        <html><body>
          <span id="ContentSection__referee1Label">Schiedsrichter 1</span>
          <span id="ContentSection__referee2Label">Schiedsrichter 2</span>
          <span id="ContentSection__timekeeperLabel">Zeitnehmer</span>
          <span id="ContentSection__secretaryLabel">Sekretär</span>
        </body></html>
      `;

      const result = service.parseHtmlToGameDetails(html);

      expect(result.officials?.referee1).toBe('Schiedsrichter 1');
      expect(result.officials?.referee2).toBe('Schiedsrichter 2');
      expect(result.officials?.timekeeper1).toBe('Zeitnehmer');
      expect(result.officials?.secretary1).toBe('Sekretär');
    });

    it('should parse quarter scores', () => {
      const html = `
        <html><body>
          <span id="ContentSection__q1Label">2:1</span>
          <span id="ContentSection__q2Label">3:2</span>
          <span id="ContentSection__q3Label">2:3</span>
          <span id="ContentSection__q4Label">3:2</span>
        </body></html>
      `;

      const result = service.parseHtmlToGameDetails(html);

      expect(result.quarterScores).toBeDefined();
      expect(result.quarterScores.length).toBe(4);
      expect(result.quarterScores[0].quarter).toBe(1);
      expect(result.quarterScores[0].home).toBe(2);
      expect(result.quarterScores[0].guest).toBe(1);
    });

    it('should handle nobr tags and clean HTML', () => {
      const html = `
        <html><body>
          <span id="ContentSection__gameidLabel"><nobr>12345</nobr></span>
          <a href="link.html" target=_blank>Link</a>
        </body></html>
      `;

      const result = service.parseHtmlToGameDetails(html);
      expect(result.gameId).toBe('12345');
    });

    it('should parse optional fields correctly', () => {
      const html = `
        <html><body>
          <span id="ContentSection__gameidLabel">123</span>
          <span id="ContentSection__noteLabel">Wichtige Notiz</span>
          <a id="ContentSection__videolinkHyperLink" href="https://video.com">Video</a>
          <a id="ContentSection__protocolLinkButton" href="protocol.pdf">Protokoll</a>
          <span id="ContentSection__endgameLabel">20:30</span>
          <span id="ContentSection__organizerLabel">DSV</span>
        </body></html>
      `;

      const result = service.parseHtmlToGameDetails(html);

      expect(result.notes).toBe('Wichtige Notiz');
      expect(result.videoLink).toBe('https://video.com');
      expect(result.protocolLink).toBe('protocol.pdf');
      expect(result.endGameTime).toBe('20:30');
      expect(result.organizer).toBe('DSV');
    });

    it('should handle missing optional fields', () => {
      const html = `
        <html><body>
          <span id="ContentSection__gameidLabel">123</span>
        </body></html>
      `;

      const result = service.parseHtmlToGameDetails(html);

      expect(result.notes).toBeUndefined();
      expect(result.videoLink).toBeUndefined();
      expect(result.protocolLink).toBeUndefined();
      expect(result.endGameTime).toBeUndefined();
      expect(result.organizer).toBeUndefined();
    });

    it('should handle parsing errors gracefully', () => {
      const invalidHtml = '<html><body><invalid>';

      expect(() => {
        // Should not throw, but may return incomplete data
        const result = service.parseHtmlToGameDetails(invalidHtml);
        expect(result).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty HTML', () => {
      const html = '<html><body></body></html>';
      const result = service.parseHtmlToGameDetails(html);

      expect(result).toBeDefined();
      expect(result.gameId).toBe('');
    });

    it('should handle malformed scores', () => {
      const html = `
        <html><body>
          <span id="ContentSection__q1Label">invalid</span>
          <span id="ContentSection__scoreLabel">not a score</span>
        </body></html>
      `;

      const result = service.parseHtmlToGameDetails(html);
      expect(result).toBeDefined();
    });
  });
});

