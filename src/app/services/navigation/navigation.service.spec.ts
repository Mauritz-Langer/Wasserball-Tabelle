import { TestBed } from '@angular/core/testing';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Location } from '@angular/common';
import { Router, provideRouter } from '@angular/router';
import { NavigationService } from './navigation.service';

@Component({ changeDetection: ChangeDetectionStrategy.Eager,
    template: '<h1>Seite</h1>' })
class PageComponent {
}

describe('NavigationService', () => {
    let router: Router;
    let location: Location;
    let nav: NavigationService;

    beforeEach(async () => {
        TestBed.configureTestingModule({
            providers: [provideRouter([
                    { path: '', component: PageComponent },
                    { path: 'ligen', component: PageComponent },
                    { path: 'liga', component: PageComponent },
                    { path: 'team', component: PageComponent }
                ])]
        });
        router = TestBed.inject(Router);
        location = TestBed.inject(Location);
        nav = TestBed.inject(NavigationService);
    });

    it('falls back to the parent page when the visit started on this page', async () => {
        await router.navigateByUrl('/team?name=X');
        nav.back('/liga', { param: 'L1', tab: 'tabelle' });
        await new Promise(r => setTimeout(r));
        expect(location.path()).toBe('/liga?param=L1&tab=tabelle');
    });

    it('goes back in history after navigating inside the app', async () => {
        await router.navigateByUrl('/liga?param=L1');
        await router.navigateByUrl('/team?name=X');
        const back = vi.spyOn(location, 'back').mockReturnValue(undefined);
        nav.back('/ligen');
        expect(back).toHaveBeenCalled();
    });

    it('does not count tab changes (replaceUrl) as pages', async () => {
        await router.navigateByUrl('/liga?param=L1');
        await router.navigate(['/liga'], { queryParams: { param: 'L1', tab: 'tabelle' }, replaceUrl: true });
        const back = vi.spyOn(location, 'back').mockReturnValue(undefined);
        nav.back('/ligen');
        expect(back).not.toHaveBeenCalled();
        await new Promise(r => setTimeout(r));
        expect(location.path()).toBe('/ligen');
    });
});
