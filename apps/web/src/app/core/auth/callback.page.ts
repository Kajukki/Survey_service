import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { SessionService } from './session.service';

@Component({
  selector: 'app-auth-callback-page',
  standalone: true,
  template: `
    <main class="callback-page">
      <p>Completing sign in...</p>
    </main>
  `,
  styleUrl: './callback.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackPageComponent {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  constructor() {
    this.session.handleAuthCallback(window.location.href);
    void this.router.navigateByUrl('/dashboard');
  }
}
