import { TestBed } from '@angular/core/testing';
import { ApiProxyService } from './api-proxy.service';

describe('ApiProxyService', () => {
  let service: ApiProxyService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiProxyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getApiUrl', () => {
    it('should prepend /api to the given path', () => {
      const path = '/Modules/WB/WBGameList.aspx';
      const result = service.getApiUrl(path);
      expect(result).toBe('/api/Modules/WB/WBGameList.aspx');
    });

    it('should handle paths without leading slash', () => {
      const path = 'Modules/WB/WBGameList.aspx';
      const result = service.getApiUrl(path);
      expect(result).toBe('/apiModules/WB/WBGameList.aspx');
    });

    it('should handle empty path', () => {
      const path = '';
      const result = service.getApiUrl(path);
      expect(result).toBe('/api');
    });

    it('should handle paths with query parameters', () => {
      const path = '/Modules/WB/League.aspx?V=DMOL2B&S=2025';
      const result = service.getApiUrl(path);
      expect(result).toBe('/api/Modules/WB/League.aspx?V=DMOL2B&S=2025');
    });
  });

  describe('assetUrl', () => {
    it('routes DSV images through the same-origin proxy', () => {
      expect(service.assetUrl('LogoHandler.ashx?id=7')).toBe('/api/Modules/WB/LogoHandler.ashx?id=7');
      expect(service.assetUrl('/Modules/WB/LogoHandler.ashx?id=7')).toBe('/api/Modules/WB/LogoHandler.ashx?id=7');
      expect(service.assetUrl('https://dsvdaten.dsv.de/Modules/WB/LogoHandler.ashx?id=7')).toBe('/api/Modules/WB/LogoHandler.ashx?id=7');
    });

    it('keeps inline and foreign images', () => {
      expect(service.assetUrl('data:image/svg+xml;base64,AAA')).toBe('data:image/svg+xml;base64,AAA');
      expect(service.assetUrl('svg+xml;base64,AAA')).toBe('data:image/svg+xml;base64,AAA');
      expect(service.assetUrl('https://example.org/x.png')).toBe('https://example.org/x.png');
      expect(service.assetUrl(null)).toBe('');
    });
  });
});
