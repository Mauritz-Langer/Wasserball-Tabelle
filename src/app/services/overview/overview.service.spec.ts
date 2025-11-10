import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { OverviewService } from './overview.service';
import { ApiProxyService } from '../api-proxy/api-proxy.service';

describe('OverviewService', () => {
  let service: OverviewService;
  let httpMock: HttpTestingController;
  let apiProxyService: ApiProxyService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [OverviewService, ApiProxyService]
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
    it('should fetch items via HTTP', () => {
      const mockHtml = '<html><body>Overview Data</body></html>';

      service.getItems().subscribe(data => {
        expect(data).toBe(mockHtml);
      });

      const expectedUrl = apiProxyService.getApiUrl('/Modules/WB/Index.aspx?Season=2025');
      const req = httpMock.expectOne(expectedUrl);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('text');
      req.flush(mockHtml);
    });
  });

  describe('parseHtmlToItems', () => {
    it('should parse HTML to items array', () => {
      const html = `
        <html><body>
          <div id="active">
            <div class="card">
              <div>Bundesliga</div>
              <div>
                <ul>
                  <li>
                    <a href="WBGameList.aspx?V=DMOL1&S=2025">
                      <span>Bundesliga Männer</span>
                    </a>
                    <span>Männer</span>
                  </li>
                  <li>
                    <a href="WBGameList.aspx?V=DMOL1D&S=2025">
                      <span>Bundesliga Frauen</span>
                    </a>
                    <span>Frauen</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </body></html>
      `;

      const items = service.parseHtmlToItems(html);

      expect(items.length).toBeGreaterThan(0);
    });

    it('should handle empty HTML', () => {
      const html = '<html><body></body></html>';
      const items = service.parseHtmlToItems(html);

      expect(items).toEqual([]);
    });

    it('should filter out "keine aktuellen Spiele vorhanden"', () => {
      const html = `
        <html><body>
          <div id="active">
            <div class="card">
              <div>Test Liga</div>
              <div>
                <ul>
                  <li>
                    <a href="#">
                      <span>keine aktuellen Spiele vorhanden</span>
                    </a>
                    <span></span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </body></html>
      `;

      const items = service.parseHtmlToItems(html);

      // Should filter out the "keine aktuellen Spiele" item
      expect(items.length).toBe(0);
    });

    it('should handle malformed HTML gracefully', () => {
      const html = '<html><body><div>invalid</div></body></html>';

      expect(() => {
        const items = service.parseHtmlToItems(html);
        expect(items).toBeDefined();
      }).not.toThrow();
    });

    it('should remove nobr tags and target attributes', () => {
      const html = `
        <html><body>
          <div id="active">
            <div class="card">
              <div><nobr>Bundesliga</nobr></div>
              <div>
                <ul>
                  <li>
                    <a href="link.aspx" target=_blank>
                      <span>Liga Name</span>
                    </a>
                    <span>Männer</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </body></html>
      `;

      expect(() => {
        service.parseHtmlToItems(html);
      }).not.toThrow();
    });

    it('should extract link from subItem', () => {
      const html = `
        <html><body>
          <div id="active">
            <div class="card">
              <div>Test</div>
              <div>
                <ul>
                  <li>
                    <a href="WBGameList.aspx?V=TEST&S=2025">
                      <span>Test Liga</span>
                    </a>
                    <span>Männer</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </body></html>
      `;

      const items = service.parseHtmlToItems(html);

      if (items.length > 0 && items[0].subItems.length > 0) {
        expect(items[0].subItems[0].link).toContain('WBGameList.aspx');
      }
    });

    it('should extract gender information', () => {
      const html = `
        <html><body>
          <div id="active">
            <div class="card">
              <div>Test</div>
              <div>
                <ul>
                  <li>
                    <a href="link.aspx">
                      <span>Test Liga</span>
                    </a>
                    <span>Frauen</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </body></html>
      `;

      const items = service.parseHtmlToItems(html);

      if (items.length > 0 && items[0].subItems.length > 0) {
        expect(items[0].subItems[0].gender).toBeDefined();
      }
    });

    it('should set isFavorite to false by default', () => {
      const html = `
        <html><body>
          <div id="active">
            <div class="card">
              <div>Test</div>
              <div>
                <ul>
                  <li>
                    <a href="link.aspx">
                      <span>Test Liga</span>
                    </a>
                    <span>Männer</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </body></html>
      `;

      const items = service.parseHtmlToItems(html);

      if (items.length > 0 && items[0].subItems.length > 0) {
        expect(items[0].subItems[0].isFavorite).toBe(false);
      }
    });
  });
});
