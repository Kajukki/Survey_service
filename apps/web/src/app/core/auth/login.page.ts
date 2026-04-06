import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthApiService } from './auth-api.service';
import { SessionService } from './session.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <main class="auth-page">
      <section class="auth-card">
        <h1>{{ mode() === 'login' ? 'Sign in to Survey Service' : 'Create your account' }}</h1>
        <p>Use your credentials to continue. For local setup details, see LOCAL_DEVELOPMENT.md.</p>

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label for="username">Username</label>
          <input id="username" type="text" formControlName="username" autocomplete="username" />

          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            formControlName="password"
            autocomplete="current-password"
          />

          @if (errorMessage()) {
            <p class="error">{{ errorMessage() }}</p>
          }

          <div class="actions">
            <button type="submit" [disabled]="form.invalid || isSubmitting()">
              {{ isSubmitting() ? 'Working...' : mode() === 'login' ? 'Sign in' : 'Register' }}
            </button>
            <button
              type="button"
              class="secondary"
              (click)="toggleMode()"
              [disabled]="isSubmitting()"
            >
              {{
                mode() === 'login'
                  ? 'Need an account? Register'
                  : 'Already have an account? Sign in'
              }}
            </button>
          </div>
        </form>
      </section>
    </main>
  `,
  styleUrl: './login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);
  private readonly session = inject(SessionService);

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    if (this.route.snapshot.routeConfig?.path === 'register') {
      this.mode.set('register');
    }
  }

  protected toggleMode(): void {
    this.mode.update((current) => (current === 'login' ? 'register' : 'login'));
    this.errorMessage.set(null);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const username = this.form.controls.username.value ?? '';
    const password = this.form.controls.password.value ?? '';

    try {
      const payload =
        this.mode() === 'login'
          ? await this.authApi.login({ username, password })
          : await this.authApi.register({ username, password });

      this.session.beginSession(payload);

      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
      await this.router.navigateByUrl(returnUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      this.errorMessage.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
