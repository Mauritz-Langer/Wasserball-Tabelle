import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { Router, NavigationEnd } from '@angular/router';
import { FavoritesService } from './services/favorites/favorites.service';
import { ThemeService } from './services/theme/theme.service';
import { Subject, BehaviorSubject } from 'rxjs';
import { provideRouter } from '@angular/router';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: any;
  let router: Router;
  let favoritesService: jasmine.SpyObj<FavoritesService>;
  let themeService: jasmine.SpyObj<ThemeService>;
  let routerEventsSubject: Subject<any>;
  let favoritesCountSubject: BehaviorSubject<number>;

  beforeEach(async () => {
    routerEventsSubject = new Subject();
    favoritesCountSubject = new BehaviorSubject<number>(0);

    const favoritesServiceSpy = jasmine.createSpyObj('FavoritesService', ['updateCount'], {
      favoritesCount$: favoritesCountSubject.asObservable()
    });

    const themeServiceSpy = jasmine.createSpyObj('ThemeService', ['toggleTheme', 'isDarkMode'], {
      currentTheme: jasmine.createSpy().and.returnValue('light'),
      effectiveTheme: jasmine.createSpy().and.returnValue('light')
    });

    await TestBed.configureTestingModule({
      imports: [AppComponent, BrowserAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: favoritesServiceSpy },
        { provide: ThemeService, useValue: themeServiceSpy }
      ]
    }).compileComponents();

    favoritesService = TestBed.inject(FavoritesService) as jasmine.SpyObj<FavoritesService>;
    themeService = TestBed.inject(ThemeService) as jasmine.SpyObj<ThemeService>;
    router = TestBed.inject(Router);

    // Mock router events
    Object.defineProperty(router, 'events', {
      get: () => routerEventsSubject.asObservable()
    });

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should subscribe to router events', () => {
      fixture.detectChanges();

      routerEventsSubject.next(new NavigationEnd(1, '/', '/'));
      expect(component.isHomePage).toBe(true);

      routerEventsSubject.next(new NavigationEnd(2, '/liga', '/liga'));
      expect(component.isHomePage).toBe(false);
    });

    it('should subscribe to favorites count changes', () => {
      fixture.detectChanges();

      favoritesCountSubject.next(5);
      expect(component.favoritesCount).toBe(5);

      favoritesCountSubject.next(10);
      expect(component.favoritesCount).toBe(10);
    });

    it('should set current year', () => {
      fixture.detectChanges();

      const currentYear = new Date().getFullYear();
      expect(component.currentYear).toBe(currentYear);
    });
  });

  describe('goHome', () => {
    it('should navigate to home page', () => {
      spyOn(router, 'navigate');

      component.goHome();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });
  });

  describe('openDsvWebsite', () => {
    it('should open DSV website in new tab', () => {
      spyOn(window, 'open');

      component.openDsvWebsite();

      expect(window.open).toHaveBeenCalledWith(
        'https://dsvdaten.dsv.de/Modules/WB/Index.aspx',
        '_blank'
      );
    });
  });

  describe('toggleTheme', () => {
    it('should call theme service toggle', () => {
      component.toggleTheme();

      expect(themeService.toggleTheme).toHaveBeenCalled();
    });
  });

  describe('getThemeIcon', () => {
    it('should return light_mode icon when dark mode is active', () => {
      themeService.isDarkMode.and.returnValue(true);

      expect(component.getThemeIcon()).toBe('light_mode');
    });

    it('should return dark_mode icon when light mode is active', () => {
      themeService.isDarkMode.and.returnValue(false);

      expect(component.getThemeIcon()).toBe('dark_mode');
    });
  });

  describe('getThemeTooltip', () => {
    it('should return correct tooltip for dark mode', () => {
      themeService.isDarkMode.and.returnValue(true);

      expect(component.getThemeTooltip()).toBe('Light Mode aktivieren');
    });

    it('should return correct tooltip for light mode', () => {
      themeService.isDarkMode.and.returnValue(false);

      expect(component.getThemeTooltip()).toBe('Dark Mode aktivieren');
    });
  });

  describe('Route Detection', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should detect home page for root route', () => {
      routerEventsSubject.next(new NavigationEnd(1, '/', '/'));
      expect(component.isHomePage).toBe(true);
    });

    it('should detect home page for root with query params', () => {
      routerEventsSubject.next(new NavigationEnd(1, '/?param=value', '/?param=value'));
      expect(component.isHomePage).toBe(true);
    });

    it('should detect non-home page for other routes', () => {
      routerEventsSubject.next(new NavigationEnd(1, '/liga', '/liga'));
      expect(component.isHomePage).toBe(false);

      routerEventsSubject.next(new NavigationEnd(2, '/game-details', '/game-details'));
      expect(component.isHomePage).toBe(false);
    });
  });

  describe('Favorites Count Display', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should update when favorites count changes', () => {
      expect(component.favoritesCount).toBe(0);

      favoritesCountSubject.next(3);
      expect(component.favoritesCount).toBe(3);

      favoritesCountSubject.next(7);
      expect(component.favoritesCount).toBe(7);
    });
  });
});
