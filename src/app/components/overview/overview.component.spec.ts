import {ComponentFixture, TestBed} from '@angular/core/testing';
import {OverviewComponent} from './overview.component';
import {OverviewService} from '../../services/overview/overview.service';
import {FavoritesService} from '../../services/favorites/favorites.service';
import {Router} from '@angular/router';
import {of} from 'rxjs';
import {HttpClientTestingModule} from '@angular/common/http/testing';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {Item} from '../../models/item';
import {SubItem} from '../../models/subItem';

describe('OverviewComponent', () => {
  let component: OverviewComponent;
  let fixture: ComponentFixture<OverviewComponent>;
  let overviewService: jasmine.SpyObj<OverviewService>;
  let favoritesService: jasmine.SpyObj<FavoritesService>;
  let router: jasmine.SpyObj<Router>;

  const mockItems: Item[] = [
    {
      name: 'Bundesliga',
      subItems: [
        {name: 'Bundesliga Männer', link: 'link1', gender: 'Männer', isFavorite: false},
        {name: 'Bundesliga Frauen', link: 'link2', gender: 'Frauen', isFavorite: true}
      ]
    },
    {
      name: 'Oberliga',
      subItems: [
        {name: 'Oberliga Nord', link: 'link3', gender: 'Männer', isFavorite: false}
      ]
    }
  ];

  beforeEach(async () => {
    const overviewServiceSpy = jasmine.createSpyObj('OverviewService', ['getItems', 'parseHtmlToItems']);
    const favoritesServiceSpy = jasmine.createSpyObj('FavoritesService', ['updateCount']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [
        OverviewComponent,
        HttpClientTestingModule,
        BrowserAnimationsModule
      ],
      providers: [
        {provide: OverviewService, useValue: overviewServiceSpy},
        {provide: FavoritesService, useValue: favoritesServiceSpy},
        {provide: Router, useValue: routerSpy}
      ]
    })
      .compileComponents();

    overviewService = TestBed.inject(OverviewService) as jasmine.SpyObj<OverviewService>;
    favoritesService = TestBed.inject(FavoritesService) as jasmine.SpyObj<FavoritesService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    // Setup default mock responses
    overviewService.getItems.and.returnValue(of('<html></html>'));
    overviewService.parseHtmlToItems.and.returnValue(mockItems);

    // Mock localStorage
    let store: { [key: string]: string } = {};
    spyOn(localStorage, 'getItem').and.callFake((key: string) => store[key] || null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => {
      store[key] = value;
    });

    fixture = TestBed.createComponent(OverviewComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load items on initialization', () => {
      fixture.detectChanges();

      expect(overviewService.getItems).toHaveBeenCalled();
      expect(overviewService.parseHtmlToItems).toHaveBeenCalled();
      expect(component.items.length).toBe(2);
      expect(component.isLoading).toBe(false);
    });

    it('should set filteredItems to all items initially', () => {
      fixture.detectChanges();

      expect(component.filteredItems.length).toBe(2);
      expect(component.filteredItems).toEqual(component.items);
    });
  });

  describe('favorites getter', () => {
    it('should return all favorite subItems', () => {
      // Setup localStorage mit Favoriten vor fixture.detectChanges()
      const favoritesData = JSON.stringify([
        {name: 'Bundesliga Frauen', link: 'link2', gender: 'Frauen', isFavorite: true}
      ]);
      (localStorage.getItem as jasmine.Spy).and.returnValue(favoritesData);

      fixture.detectChanges();

      const favorites = component.favorites;
      expect(favorites.length).toBe(1);
      expect(favorites[0].name).toBe('Bundesliga Frauen');
    });

    it('should return empty array when no favorites', () => {
      const noFavItems: Item[] = [
        {
          name: 'Test',
          subItems: [
            {name: 'Item 1', link: 'link1', isFavorite: false, gender: 'Männer'},
          ]
        }
      ];
      overviewService.parseHtmlToItems.and.returnValue(noFavItems);
      fixture.detectChanges();

      expect(component.favorites.length).toBe(0);
    });
  });

  describe('filterItems', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should show all items when search term is empty', () => {
      component.searchTerm = '';
      component.filterItems();

      expect(component.filteredItems.length).toBe(2);
    });

    it('should filter items by name', () => {
      component.searchTerm = 'Bundesliga Männer';
      component.filterItems();

      expect(component.filteredItems.length).toBe(1);
      expect(component.filteredItems[0].name).toBe('Bundesliga');
      expect(component.filteredItems[0].subItems.length).toBe(1);
    });

    it('should filter items by gender', () => {
      component.searchTerm = 'Frauen';
      component.filterItems();

      expect(component.filteredItems.length).toBe(1);
      expect(component.filteredItems[0].subItems[0].name).toBe('Bundesliga Frauen');
    });

    it('should be case insensitive', () => {
      component.searchTerm = 'OBERLIGA';
      component.filterItems();

      expect(component.filteredItems.length).toBe(1);
      expect(component.filteredItems[0].name).toBe('Oberliga');
    });

    it('should trim whitespace', () => {
      component.searchTerm = '  Bundesliga  ';
      component.filterItems();

      expect(component.filteredItems.length).toBe(1);
    });
  });

  describe('toggleFavorite', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should toggle favorite status', () => {
      const subItem = component.items[0].subItems[0];
      const initialStatus = subItem.isFavorite;

      component.toggleFavorite(subItem);

      expect(subItem.isFavorite).toBe(!initialStatus);
    });

    it('should save favorites to localStorage', () => {
      const subItem = component.items[0].subItems[0];

      component.toggleFavorite(subItem);

      expect(localStorage.setItem).toHaveBeenCalledWith('favorites', jasmine.any(String));
    });

    it('should update favorites service count', () => {
      const subItem = component.items[0].subItems[0];

      component.toggleFavorite(subItem);

      expect(favoritesService.updateCount).toHaveBeenCalled();
    });
  });

  describe('saveFavorites', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should save favorites to localStorage', () => {
      component.saveFavorites();

      expect(localStorage.setItem).toHaveBeenCalledWith('favorites', jasmine.any(String));
    });

    it('should update favorites service', () => {
      component.saveFavorites();

      expect(favoritesService.updateCount).toHaveBeenCalled();
    });
  });

  describe('navigateToLiga', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should navigate to liga with correct params', () => {
      const subItem: SubItem = {name: 'Test Liga', link: 'test.aspx?param=123', isFavorite: false, gender: "Männer"};

      component.navigateToLiga(subItem);

      expect(router.navigate).toHaveBeenCalledWith(['/liga'], {queryParams: {param: 'test.aspx?param=123'}});
    });
  });

  describe('loadFavorites', () => {
    it('should load favorites from localStorage', () => {
      const storedFavorites = JSON.stringify([
        {name: 'Bundesliga Männer', link: 'link1', gender: 'Männer'}
      ]);
      localStorage.setItem('favorites', storedFavorites);

      fixture.detectChanges();

      const favorite = component.items[0].subItems.find(si => si.link === 'link1');
      expect(favorite?.isFavorite).toBe(true);
    });
  });
});
