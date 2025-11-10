import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { GameDetailsService } from './game-details.service';
import { ApiProxyService } from '../api-proxy/api-proxy.service';

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
    it('should parse HTML without throwing', () => {
      const html = `
        <html><body>
          <span id="ContentSection__gameidLabel">12345</span>
          <span id="ContentSection__leagueLabel">Bundesliga</span>
        </body></html>
      `;

      expect(() => {
        const result = service.parseHtmlToGameDetails(html);
        expect(result).toBeDefined();
        expect(result.gameId).toBe('12345');
      }).not.toThrow();
    });

    it('should handle empty HTML', () => {
      const html = '<html><body></body></html>';

      expect(() => {
        const result = service.parseHtmlToGameDetails(html);
        expect(result).toBeDefined();
      }).not.toThrow();
    });

    it('should handle malformed HTML gracefully', () => {
      const html = '<html><body><invalid>';

      expect(() => {
        const result = service.parseHtmlToGameDetails(html);
        expect(result).toBeDefined();
      }).not.toThrow();
    });
  });
});

