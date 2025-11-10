import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';

describe('FavoritesService', () => {
  let service: FavoritesService;

  beforeEach(() => {
    // Mock localStorage
    let store: { [key: string]: string } = {};
    const mockLocalStorage = {
      getItem: (key: string): string | null => {
        return key in store ? store[key] : null;
      },
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      }
    };

    spyOn(localStorage, 'getItem').and.callFake(mockLocalStorage.getItem);
    spyOn(localStorage, 'setItem').and.callFake(mockLocalStorage.setItem);
    spyOn(localStorage, 'removeItem').and.callFake(mockLocalStorage.removeItem);
    spyOn(localStorage, 'clear').and.callFake(mockLocalStorage.clear);

    TestBed.configureTestingModule({});
    service = TestBed.inject(FavoritesService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('updateCount', () => {
    it('should update count to 0 when no favorites in localStorage', () => {
      localStorage.setItem('favorites', JSON.stringify([]));
      service.updateCount();
      expect(service.getCount()).toBe(0);
    });

    it('should update count based on favorites array in localStorage', () => {
      const favorites = ['liga1', 'liga2', 'liga3'];
      localStorage.setItem('favorites', JSON.stringify(favorites));
      service.updateCount();
      expect(service.getCount()).toBe(3);
    });

    it('should handle missing localStorage entry', () => {
      localStorage.removeItem('favorites');
      service.updateCount();
      expect(service.getCount()).toBe(0);
    });

    it('should update favoritesCount$ observable', (done) => {
      const favorites = ['liga1', 'liga2'];
      localStorage.setItem('favorites', JSON.stringify(favorites));

      // Skip the initial emission and only check the updated one
      let emissionCount = 0;
      service.favoritesCount$.subscribe(count => {
        emissionCount++;
        if (emissionCount === 2) { // Second emission after updateCount
          expect(count).toBe(2);
          done();
        }
      });

      service.updateCount();
    });
  });

  describe('getCount', () => {
    it('should return current favorites count', () => {
      const favorites = ['liga1', 'liga2', 'liga3', 'liga4'];
      localStorage.setItem('favorites', JSON.stringify(favorites));
      service.updateCount();

      expect(service.getCount()).toBe(4);
    });

    it('should return 0 for empty favorites', () => {
      localStorage.setItem('favorites', JSON.stringify([]));
      service.updateCount();

      expect(service.getCount()).toBe(0);
    });
  });

  describe('favoritesCount$ Observable', () => {
    it('should emit initial count on subscription', (done) => {
      const favorites = ['liga1'];
      localStorage.setItem('favorites', JSON.stringify(favorites));

      // Create new service instance to test constructor behavior
      const newService = new FavoritesService();

      newService.favoritesCount$.subscribe(count => {
        expect(count).toBe(1);
        done();
      });
    });

    it('should emit new count when updateCount is called', (done) => {
      let emissionCount = 0;
      const expectedCounts = [0, 3];

      service.favoritesCount$.subscribe(count => {
        expect(count).toBe(expectedCounts[emissionCount]);
        emissionCount++;
        if (emissionCount === 2) {
          done();
        }
      });

      // First emission is from constructor (0)
      // Second emission from manual updateCount
      localStorage.setItem('favorites', JSON.stringify(['liga1', 'liga2', 'liga3']));
      service.updateCount();
    });
  });
});

