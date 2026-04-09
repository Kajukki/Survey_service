import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';

import { ApiSuccessEnvelope, emptyEnvelope } from '../../core/api/api-envelope';
import { API_BASE_URL } from '../../core/api/api-config.token';
import { ConnectionDto, mapConnections } from '../../core/api/survey-api.adapters';
import { ProviderAuthApiService } from '../../core/auth/provider-auth-api.service';
import { startGoogleOAuthFlow } from '../../core/auth/provider-oauth-start-flow';
import { Connection } from '../../shared/models/domain.models';

@Component({
  selector: 'app-connections-page',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="card page">
      <header class="page-header">
        <h2>Connections</h2>
        <p>Manage Google and Microsoft connectors for sync jobs.</p>
      </header>

      <div class="actions">
        <button
          type="button"
          class="btn-primary"
          (click)="connectGoogle()"
          [disabled]="isConnectingGoogle()"
        >
          {{ isConnectingGoogle() ? 'Redirecting to Google...' : 'Connect Google' }}
        </button>
      </div>

      @if (oauthStatusMessage()) {
        <p class="status-message" [class.error]="oauthStatusType() === 'error'">
          {{ oauthStatusMessage() }}
        </p>
      }

      @if (connectErrorMessage()) {
        <p class="error">{{ connectErrorMessage() }}</p>
      }

      @if (connections.isLoading()) {
        <p class="empty-state">Loading connections...</p>
      } @else if (connections.error()) {
        <p class="error">Could not load connectors. Try refresh.</p>
      } @else {
        <ul class="surface-list">
          @for (connection of connectionItems(); track connection.id) {
            <li
              class="surface-list-item connection-item"
              [class]="connectionItemClass(connection.status)"
            >
              <strong class="connection-provider">{{ connection.provider }}</strong>
              <span class="status-badge" [class]="connectionBadgeClass(connection.status)">
                <span class="status-badge__dot" aria-hidden="true"></span>
                {{ connection.status }}
              </span>
              <span class="surface-list-item__time">{{
                connection.updatedAt | date: 'mediumDate'
              }}</span>
            </li>
          } @empty {
            <li class="surface-list-item empty-state">No connector configured yet.</li>
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
      const authStart = await startGoogleOAuthFlow({
        origin: window.location.origin,
        storage: window.sessionStorage,
        startGoogleAuth: (input) => this.providerAuthApi.startGoogleAuth(input),
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

  protected connectionBadgeClass(status: string): string {
    return `status-badge status-badge--${this.toStatusTone(status)}`;
  }

  protected connectionItemClass(status: string): string {
    return `surface-list-item connection-item surface-list-item--${this.toStatusTone(status)}`;
  }

  private toStatusTone(status: string): 'connected' | 'connecting' | 'disconnected' | 'queued' {
    const normalized = status.toLowerCase();
    if (
      normalized.includes('active') ||
      normalized.includes('connected') ||
      normalized.includes('ready')
    ) {
      return 'connected';
    }

    if (
      normalized.includes('pending') ||
      normalized.includes('authorizing') ||
      normalized.includes('syncing')
    ) {
      return 'connecting';
    }

    if (normalized.includes('queue') || normalized.includes('queued')) {
      return 'queued';
    }

    return 'disconnected';
  }
}
