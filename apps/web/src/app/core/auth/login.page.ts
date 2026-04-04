import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { SessionService } from './session.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  template: `
    <main class="auth-page">
      <section class="auth-card">
        <h1>Sign in to Survey Service</h1>
        <p>
          This screen stands in for your organization identity provider. Continue to create a
          session and access dashboard and operations features.
        </p>
        <button type="button" (click)="signIn()">Continue</button>
      </section>
    </main>
  `,
  styleUrl: './login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);

  protected signIn(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    this.session.login();
    void this.router.navigateByUrl(returnUrl);
  }
}
