import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ProviderAuthApiService } from './provider-auth-api.service';
import { resolveAuthCallbackNavigation } from './provider-callback-flow';
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
  private readonly providerAuthApi = inject(ProviderAuthApiService);

  constructor() {
    void this.completeCallback();
  }

  private async completeCallback(): Promise<void> {
    const destination = await resolveAuthCallbackNavigation({
      callbackUrl: window.location.href,
      origin: window.location.origin,
      storage: window.sessionStorage,
      session: this.session,
      providerAuthApi: this.providerAuthApi,
    });

    await this.router.navigateByUrl(destination);
  }
}
