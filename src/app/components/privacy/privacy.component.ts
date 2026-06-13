import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import { ConsentService } from '../../services/consent/consent.service';

@Component({
    selector: 'app-privacy',
    standalone: true,
    imports: [MatIcon, MatButton, MatIconButton],
    templateUrl: './privacy.component.html',
    styleUrl: './privacy.component.scss'
})
export class PrivacyComponent {
    private location = inject(Location);
    private router = inject(Router);
    consentService = inject(ConsentService);

    goBack(): void {
        // Safe when the page was opened directly (no in-app history).
        if (history.length > 1) {
            this.location.back();
        } else {
            this.router.navigate(['/']);
        }
    }

    revoke(): void {
        this.consentService.decline();
    }

    allow(): void {
        this.consentService.accept();
    }
}
