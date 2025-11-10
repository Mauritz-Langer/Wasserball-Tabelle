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
});

