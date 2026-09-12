import { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Thrown for any non-2xx response, and for enveloped responses whose `code`
 * is not "ok". Carries the backend's own `code`/body so a failing test reads
 * as the server's reason ("notFound", "unauthorized") rather than a parse error.
 */
export class ApiError extends Error {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly status: number,
    readonly code: string | undefined,
    readonly body: unknown,
  ) {
    const summary = typeof body === 'string' ? body : JSON.stringify(body);
    super(`${method} ${url} -> HTTP ${status}${code ? ` (${code})` : ''}: ${summary.slice(0, 300)}`);
    this.name = 'ApiError';
  }
}

/**
 * Minimal JSON client over Playwright's APIRequestContext.
 *
 * The Givergy back ends mix two response styles:
 *  - enveloped: `{ code: "ok", message, extra, entity, totalCount }` (EMS reports,
 *    cancel-donation, all Lite endpoints) — unwrapped to `entity`;
 *  - bare payloads (check-in make-donation, per-guest payments/transactions and
 *    payments/checkout) — returned as-is.
 * `parse()` unwraps only when both `code` and `entity` keys are present.
 */
export class HttpClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const response = await this.request.get(this.url(path), { headers: this.headers(), params });
    return this.parse<T>('GET', path, response);
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    const response = await this.request.post(this.url(path), { headers: this.headers(), data });
    return this.parse<T>('POST', path, response);
  }

  /** Partial update. Only the GLI raffle iBid endpoint uses this verb (see `EmsApi.gliRaffles.update`) — tickets/lots use `post`. */
  async patch<T>(path: string, data?: unknown): Promise<T> {
    const response = await this.request.patch(this.url(path), { headers: this.headers(), data });
    return this.parse<T>('PATCH', path, response);
  }

  /** Full replace / action-style call. Only the Stripe subscription cancel endpoint uses this verb (see `EmsApi.subscriptions.cancel`). */
  async put<T>(path: string, data?: unknown): Promise<T> {
    const response = await this.request.put(this.url(path), { headers: this.headers(), data });
    return this.parse<T>('PUT', path, response);
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
  }

  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private async parse<T>(method: string, path: string, response: APIResponse): Promise<T> {
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // non-JSON body (e.g. an HTML error page) — keep the raw text for the error message
    }
    const envelope = body as { code?: string; entity?: unknown } | null;
    const code = envelope && typeof envelope === 'object' ? envelope.code : undefined;
    if (!response.ok()) {
      throw new ApiError(method, path, response.status(), code, body);
    }
    if (envelope && typeof envelope === 'object' && 'code' in envelope && 'entity' in envelope) {
      if (envelope.code !== 'ok') {
        throw new ApiError(method, path, response.status(), envelope.code, body);
      }
      return envelope.entity as T;
    }
    return body as T;
  }
}
