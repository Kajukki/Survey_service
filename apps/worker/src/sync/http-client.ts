import type { ConnectorHttpClient } from '@survey-service/connectors';

export function createFetchHttpClient(timeoutMs: number = 10_000): ConnectorHttpClient {
  return {
    async request<T>(input: {
      method: 'GET' | 'POST';
      url: string;
      headers?: Record<string, string>;
      query?: Record<string, string | undefined>;
      body?: unknown;
    }) {
      const url = new URL(input.url);

      if (input.query) {
        for (const [key, value] of Object.entries(input.query)) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: input.method,
          headers: input.headers,
          body: input.body ? JSON.stringify(input.body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const rawBody = await response.text().catch(() => '');
          const contentType = response.headers.get('content-type') ?? '';
          const body = (() => {
            if (!rawBody) {
              return undefined;
            }

            if (contentType.includes('application/json')) {
              try {
                return JSON.parse(rawBody) as unknown;
              } catch {
                return rawBody;
              }
            }

            return rawBody;
          })();

          const bodyPreview =
            typeof body === 'string'
              ? body.slice(0, 1000)
              : body
                ? JSON.stringify(body).slice(0, 1000)
                : undefined;

          const responseHeaders = {
            'content-type': response.headers.get('content-type'),
            'www-authenticate': response.headers.get('www-authenticate'),
            'x-goog-request-id': response.headers.get('x-goog-request-id'),
          };

          throw {
            message: `Google API request failed with status ${response.status} for ${input.method} ${url.toString()}${bodyPreview ? ` | body: ${bodyPreview}` : ''}`,
            response: {
              status: response.status,
              data: body,
              headers: responseHeaders,
            },
          };
        }

        return (await response.json()) as T;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
