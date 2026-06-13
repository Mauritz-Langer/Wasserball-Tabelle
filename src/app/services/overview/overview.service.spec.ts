import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { OverviewService } from './overview.service';
import { ApiProxyService } from '../api-proxy/api-proxy.service';
import { SeasonService } from '../season/season.service';
import { signal } from '@angular/core';

describe('OverviewService', () => {
  let service: OverviewService;
  let httpMock: HttpTestingController;
  let apiProxyService: ApiProxyService;

  beforeEach(() => {
    const seasonServiceMock = {
      currentSeason: signal('2025'),
      isCurrentSeason: true,
      getSeasonLabel: () => '2025/2026',
      isLive: () => true,
      setSeason: jasmine.createSpy('setSeason')
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        OverviewService,
        ApiProxyService,
        { provide: SeasonService, useValue: seasonServiceMock }
      ]
    });
    service = TestBed.inject(OverviewService);
    httpMock = TestBed.inject(HttpTestingController);
    apiProxyService = TestBed.inject(ApiProxyService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getItems', () => {
    it('should fetch items via HTTP and return parsed items', () => {
      const mockHtml = '<html><body></body></html>';

      service.getItems().subscribe(data => {
        // getItems now returns Item[], not raw HTML
        expect(Array.isArray(data)).toBeTrue();
      });

      const expectedUrl = apiProxyService.getApiUrl('/Modules/WB/Index.aspx?Season=2025');
      const req = httpMock.expectOne(expectedUrl);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('text');
      req.flush(mockHtml);
    });
  });

  describe('parseHtmlToItems', () => {
    // Mirrors the real DSV markup:
    //   #active > .card (.card-header = category) > .card-body table
    //     tr > td>a[League.aspx] (name+link) | td (gender) | td (next game / Live link)
    const realHtml = `
      <html><body>
        <div id="active">
          <div class="card">
            <div class="card-header">aktuelle Woche</div>
            <div class="card-body">
              <select><option>* alle Ligen *</option></select>
            </div>
          </div>
          <div class="card">
            <div class="card-header">National Jugend</div>
            <div class="card-body table-responsive">
              <table class="table table-sm">
                <tr>
                  <td><a href="League.aspx?Season=2025&LeagueID=341&Group=1&LeagueKind=E">DM U14 Endrunde 1</a></td>
                  <td>männlich</td>
                  <td><a href="https://lizenz.dsv.de/Live.aspx" target="_blank">in 4h LIVE!</a></td>
                </tr>
                <tr>
                  <td><a href="League.aspx?Season=2025&LeagueID=342&Group=&LeagueKind=E">DM U14 weiblich</a></td>
                  <td>weiblich</td>
                  <td>in 20 Tagen</td>
                </tr>
              </table>
            </div>
          </div>
        </div>
      </body></html>
    `;

    it('parses categories and leagues from the real DSV structure', () => {
      const items = service.parseHtmlToItems(realHtml);
      // The "aktuelle Woche" card has no League.aspx links -> skipped.
      expect(items.length).toBe(1);
      expect(items[0].name).toBe('National Jugend');
      expect(items[0].subItems.length).toBe(2);
    });

    it('extracts name, link and gender; ignores the Live.aspx link', () => {
      const sub = service.parseHtmlToItems(realHtml)[0].subItems;
      expect(sub[0].name).toBe('DM U14 Endrunde 1');
      expect(sub[0].link).toContain('League.aspx?Season=2025&LeagueID=341');
      expect(sub[0].link).not.toContain('Live.aspx');
      expect(sub[0].gender).toBe('männlich');
      expect(sub[1].gender).toBe('weiblich');
      expect(sub[0].isFavorite).toBeFalse();
    });

    it('returns [] for empty or active-less HTML', () => {
      expect(service.parseHtmlToItems('<html><body></body></html>')).toEqual([]);
      expect(service.parseHtmlToItems('<div>nope</div>')).toEqual([]);
    });

    it('filters out "keine aktuellen Spiele vorhanden"', () => {
      const html = `
        <div id="active"><div class="card">
          <div class="card-header">Leer</div>
          <div class="card-body"><table><tr>
            <td><a href="League.aspx?x">keine aktuellen Spiele vorhanden</a></td><td></td>
          </tr></table></div>
        </div></div>`;
      expect(service.parseHtmlToItems(html)).toEqual([]);
    });
  });
});
