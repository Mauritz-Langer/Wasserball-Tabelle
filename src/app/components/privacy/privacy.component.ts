import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { NavigationService } from '../../services/navigation/navigation.service';
import { MatIcon } from '@angular/material/icon';
import { ConsentService } from '../../services/consent/consent.service';

@Component({
    selector: 'app-privacy',
    standalone: true,
    imports: [MatIcon],
    templateUrl: './privacy.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './privacy.component.scss'
})
export class PrivacyComponent {
    private navigation = inject(NavigationService);
    consentService = inject(ConsentService);

    goBack(): void {
        this.navigation.back('/');
    }

    revoke(): void {
        this.consentService.decline();
    }

    allow(): void {
        this.consentService.accept();
    }
}
