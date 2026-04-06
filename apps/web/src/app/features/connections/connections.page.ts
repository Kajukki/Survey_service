import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';

import { ApiSuccessEnvelope, emptyEnvelope } from '../../core/api/api-envelope';
import { API_BASE_URL } from '../../core/api/api-config.token';
import { ConnectionDto, mapConnections } from '../../core/api/survey-api.adapters';
import { ProviderAuthApiService } from '../../core/auth/provider-auth-api.service';
import {
  buildGoogleCallbackRedirectUri,
  createCodeVerifier,
  createOAuthState,
  deriveS256CodeChallenge,
  savePendingGoogleOAuth,
} from '../../core/auth/provider-oauth.util';
import { Connection } from '../../shared/models/domain.models';

@Component({
  selector: 'app-connections-page',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="card page">
      <header>
        <h2>Connections</h2>
        <p>Manage Google and Microsoft connectors for sync jobs.</p>
      </header>

      <div class="actions">
        <button type="button" (click)="connectGoogle()" [disabled]="isConnectingGoogle()">
          {{ isConnectingGoogle() ? 'Redirecting to Google...' : 'Connect Google' }}
        </button>
      </div>

      @if (oauthStatusMessage()) {
        <p [class.error]="oauthStatusType() === 'error'">{{ oauthStatusMessage() }}</p>
      }

      @if (connectErrorMessage()) {
        <p class="error">{{ connectErrorMessage() }}</p>
      }

      @if (connections.isLoading()) {
        <p>Loading connections...</p>
      } @else if (connections.error()) {
        <p class="error">Could not load connectors. Try refresh.</p>
      } @else {
        <ul>
          @for (connection of connectionItems(); track connection.id) {
            <li>
              <strong>{{ connection.provider }}</strong>
              <span>{{ connection.status }}</span>
              <span>{{ connection.updatedAt | date: 'mediumDate' }}</span>
            </li>
          } @empty {
            <li>No connector configured yet.</li>
          }
        </ul>
      }
    </section>
  `,
  styleUrl: './connections.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionsPageComponent {
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly route = inject(ActivatedRoute);
  private readonly providerAuthApi = inject(ProviderAuthApiService);

  protected readonly isConnectingGoogle = signal(false);
  protected readonly connectErrorMessage = signal<string | null>(null);
  private readonly oauthStatus = signal<'linked' | 'error' | null>(
    this.readOAuthStatusFromQueryParams(),
  );
  private readonly oauthReason = signal<string | null>(this.readOAuthReasonFromQueryParams());

  protected readonly connections = httpResource<ApiSuccessEnvelope<ConnectionDto[]>>(
    () => `${this.apiBaseUrl}/connections`,
    {
      defaultValue: emptyEnvelope<ConnectionDto[]>([]),
    },
  );

  protected readonly connectionItems = computed<Connection[]>(() =>
    mapConnections(this.connections.value()?.data ?? []),
  );

  protected readonly oauthStatusType = computed<'success' | 'error' | null>(() => {
    const status = this.oauthStatus();
    if (!status) {
      return null;
    }

    return status === 'error' ? 'error' : 'success';
  });

  protected readonly oauthStatusMessage = computed<string | null>(() => {
    const status = this.oauthStatus();
    if (!status) {
      return null;
    }

    if (status === 'linked') {
      return 'Google connection linked successfully.';
    }

    const reason = this.oauthReason();
    if (reason === 'state_mismatch') {
      return 'Could not verify Google auth state. Please retry connecting your account.';
    }

    if (reason === 'exchange_failed') {
      return 'Google auth callback failed while exchanging the authorization code.';
    }

    if (reason === 'access_denied') {
      return 'Google authorization was cancelled.';
    }

    return 'Could not complete Google connection. Please retry.';
  });

  protected async connectGoogle(): Promise<void> {
    if (this.isConnectingGoogle()) {
      return;
    }

    this.isConnectingGoogle.set(true);
    this.connectErrorMessage.set(null);

    try {
      const codeVerifier = createCodeVerifier();
      const codeChallenge = await deriveS256CodeChallenge(codeVerifier);
      const state = createOAuthState();
      const redirectUri = buildGoogleCallbackRedirectUri(window.location.origin);

      savePendingGoogleOAuth(window.sessionStorage, {
        state,
        codeVerifier,
        redirectUri,
      });

      const authStart = await this.providerAuthApi.startGoogleAuth({
        redirectUri,
        codeChallenge,
        codeChallengeMethod: 'S256',
      });

      window.location.assign(authStart.authorizationUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start Google auth flow';
      this.connectErrorMessage.set(message);
    } finally {
      this.isConnectingGoogle.set(false);
    }
  }

  private readOAuthStatusFromQueryParams(): 'linked' | 'error' | null {
    const status = this.route.snapshot.queryParamMap.get('oauth');
    if (status === 'linked' || status === 'error') {
      return status;
    }

    return null;
  }

  private readOAuthReasonFromQueryParams(): string | null {
    return this.route.snapshot.queryParamMap.get('reason');
  }
}
