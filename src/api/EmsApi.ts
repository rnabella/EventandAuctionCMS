import { APIRequestContext } from '@playwright/test';
import { env } from '../config/env';
import { HttpClient } from './http';
import { CancelledDonation, CheckinDonationResult, DonationReportRow, GuestCheckout, PaymentRecord, Totals } from './types';

/**
 * The EMS ("back office") API at env.api.emsBaseUrl. Authenticated with the
 * bearer token returned by `EmsApi.login()` — the same CMS admin credentials.
 */
export class EmsApi {
  private readonly http: HttpClient;

  constructor(request: APIRequestContext, token: string, baseUrl: string = env.api.emsBaseUrl) {
    this.http = new HttpClient(request, baseUrl, token);
  }

  /**
   * POST checkin/v1/auth/login. Not enveloped: `{ id, role, fullName, twoFactorRequired, authToken }`.
   * The test admin has no 2FA, so `authToken` is usable straight away.
   */
  static async login(
    request: APIRequestContext,
    username: string,
    password: string,
    baseUrl: string = env.api.emsBaseUrl,
  ): Promise<string> {
    const http = new HttpClient(request, baseUrl);
    const body = await http.post<{ authToken: string; twoFactorRequired: boolean }>('checkin/v1/auth/login', {
      username,
      password,
      version: 0,
    });
    if (body.twoFactorRequired) {
      throw new Error('EMS login requires 2FA for this account; the API suite needs a non-2FA test admin.');
    }
    return body.authToken;
  }

  readonly reports = {
    totals: (eventId: string) => this.http.get<Totals>(`checkin/v1/events/${eventId}/reports/totals`),

    /**
     * `status` is accepted but, verified live on 2026-09-06, has NO effect:
     * `ACTIVE`, `CANCELLED`, a bogus value, and omitting it entirely all
     * return the identical row set, always including cancelled donations —
     * cancelling a donation reverses `reports/totals` but never removes its
     * row here, however long you poll. Kept as a documented (probably
     * server-side no-op) parameter rather than removed, in case a future
     * environment/version honours it; don't rely on it to exclude cancelled
     * rows in the meantime — there is currently no way to do that via this
     * endpoint.
     */
    donations: (eventId: string, opts: { status?: 'ACTIVE'; offset?: number; limit?: number } = {}) =>
      this.http.get<DonationReportRow[]>(`checkin/v1/events/${eventId}/reports/donation`, {
        status: opts.status ?? 'ACTIVE',
        offset: opts.offset ?? 0,
        limit: opts.limit ?? 50,
      }),

    /**
     * Fetches every row of the donation report, paging past `donations()`'s
     * default `limit: 50`. Needed because this report's `totalCount` is
     * always 0 (there's no way to size a single page up front), and the E2E
     * event gains one more donation row per e2e/API run — cancelled or not,
     * see `donations()`'s docblock — so a fixed-size single page is a fuse
     * that eventually stops containing the row a test is looking for. Pages
     * with `pageSize`, stopping at the first short/empty page; capped at 50
     * pages (5,000 rows at the default size) as a guard against an
     * unexpected server-side bug looping forever.
     */
    allDonations: async (eventId: string, pageSize = 100): Promise<DonationReportRow[]> => {
      const rows: DonationReportRow[] = [];
      const MAX_PAGES = 50;
      for (let page = 0; page < MAX_PAGES; page++) {
        const offset = page * pageSize;
        const batch = await this.reports.donations(eventId, { offset, limit: pageSize });
        rows.push(...batch);
        if (batch.length < pageSize) break;
      }
      return rows;
    },
  };

  readonly guests = {
    paymentTransactions: (eventId: string, guestId: string) =>
      this.http.get<PaymentRecord[]>(`checkin/v1/events/${eventId}/guests/${guestId}/payments/transactions`),

    checkout: (eventId: string, guestId: string) =>
      this.http.get<GuestCheckout>(`checkin/v1/events/${eventId}/guests/${guestId}/payments/checkout`),
  };

  /** Staff-side ("check-in") actions performed on a guest's behalf. */
  readonly checkin = {
    /** Counts toward reports/totals immediately (no payment step) — same as a Lite UI placement. */
    makeDonation: (eventId: string, guestId: string, body: { pledgeId: string; amount: number; anonymous?: boolean }) =>
      this.http.post<CheckinDonationResult>(`checkin/v1/events/${eventId}/guests/${guestId}/donations`, {
        pledgeId: body.pledgeId,
        amount: body.amount,
        anonymous: body.anonymous ?? false,
        showPopup: false,
      }),

    /** Idempotent: cancelling an already-cancelled donation returns 200 again. */
    cancelDonation: (eventId: string, guestId: string, donationId: string) =>
      this.http.post<CancelledDonation>(`checkin/v1/events/${eventId}/guests/${guestId}/donations/cancel`, {
        id: donationId,
      }),
  };
}
