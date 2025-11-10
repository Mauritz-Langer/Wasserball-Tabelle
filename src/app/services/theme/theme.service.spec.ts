import { TestBed } from '@angular/core/testing';
import { ThemeService, Theme } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let localStorageSpy: jasmine.Spy;

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

    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  it('should be created', () => {
    service = TestBed.inject(ThemeService);
    expect(service).toBeTruthy();
  });

  describe('getInitialTheme', () => {
    it('should return saved theme from localStorage', () => {
      localStorage.setItem('app-theme', 'dark');
      service = TestBed.inject(ThemeService);
      expect(service.currentTheme()).toBe('dark');
    });

    it('should return light as fallback when no theme is saved', () => {
      localStorage.removeItem('app-theme');
      service = TestBed.inject(ThemeService);
      expect(service.currentTheme()).toBe('light');
    });

    it('should return light for invalid saved theme', () => {
      localStorage.setItem('app-theme', 'invalid');
      service = TestBed.inject(ThemeService);
      expect(service.currentTheme()).toBe('light');
    });
  });

  describe('applyTheme', () => {
    beforeEach(() => {
      service = TestBed.inject(ThemeService);
      // Wait for initial theme application
      TestBed.flushEffects();
    });

    it('should apply light-theme class to body', () => {
      service.setTheme('light');
      TestBed.flushEffects(); // Flush effects after setTheme
      expect(document.body.classList.contains('light-theme')).toBe(true);
      expect(document.body.classList.contains('dark-theme')).toBe(false);
    });

    it('should apply dark-theme class to body', () => {
      service.setTheme('dark');
      TestBed.flushEffects(); // Flush effects after setTheme
      expect(document.body.classList.contains('dark-theme')).toBe(true);
      expect(document.body.classList.contains('light-theme')).toBe(false);
    });

    it('should resolve auto to light or dark based on system preference', () => {
      // This test depends on system settings, so we just check that a theme is applied
      service.setTheme('auto');
      TestBed.flushEffects(); // Flush effects after setTheme
      const hasLightOrDark = document.body.classList.contains('light-theme') ||
                            document.body.classList.contains('dark-theme');
      expect(hasLightOrDark).toBe(true);
    });
  });

  describe('setTheme', () => {
    beforeEach(() => {
      service = TestBed.inject(ThemeService);
      TestBed.flushEffects();
    });

    it('should update currentTheme signal', () => {
      service.setTheme('dark');
      expect(service.currentTheme()).toBe('dark');
    });

    it('should save theme to localStorage', (done) => {
      // Use setTimeout to wait for effect to run
      service.setTheme('dark');
      setTimeout(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith('app-theme', 'dark');
        done();
      }, 0);
    });

    it('should apply theme when set', (done) => {
      service.setTheme('dark');
      setTimeout(() => {
        expect(document.body.classList.contains('dark-theme')).toBe(true);
        done();
      }, 0);
    });
  });

  describe('toggleTheme', () => {
    beforeEach(() => {
      service = TestBed.inject(ThemeService);
    });

    it('should toggle from light to dark', () => {
      service.setTheme('light');
      service.toggleTheme();
      expect(service.currentTheme()).toBe('dark');
    });

    it('should toggle from dark to light', () => {
      service.setTheme('dark');
      service.toggleTheme();
      expect(service.currentTheme()).toBe('light');
    });

    it('should toggle from auto based on effective theme', () => {
      service.setTheme('auto');
      const effectiveBefore = service.effectiveTheme();
      service.toggleTheme();
      const expectedTheme = effectiveBefore === 'light' ? 'dark' : 'light';
      expect(service.currentTheme()).toBe(expectedTheme);
    });
  });

  describe('isDarkMode', () => {
    beforeEach(() => {
      service = TestBed.inject(ThemeService);
    });

    it('should return true when theme is dark', () => {
      service.setTheme('dark');
      expect(service.isDarkMode()).toBe(true);
    });

    it('should return false when theme is light', () => {
      service.setTheme('light');
      expect(service.isDarkMode()).toBe(false);
    });

    it('should return false when theme is auto', () => {
      service.setTheme('auto');
      expect(service.isDarkMode()).toBe(false);
    });
  });

  describe('effectiveTheme', () => {
    beforeEach(() => {
      service = TestBed.inject(ThemeService);
      TestBed.flushEffects();
    });

    it('should return light when theme is light', (done) => {
      service.setTheme('light');
      setTimeout(() => {
        expect(service.effectiveTheme()).toBe('light');
        done();
      }, 0);
    });

    it('should return dark when theme is dark', (done) => {
      service.setTheme('dark');
      setTimeout(() => {
        expect(service.effectiveTheme()).toBe('dark');
        done();
      }, 0);
    });

    it('should resolve auto to light or dark', (done) => {
      service.setTheme('auto');
      setTimeout(() => {
        const effective = service.effectiveTheme();
        expect(['light', 'dark']).toContain(effective);
        done();
      }, 0);
    });
  });
});

