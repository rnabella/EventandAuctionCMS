import { APIRequestContext } from '@playwright/test';
import { env } from '../config/env';
import { ApiError, HttpClient } from './http';
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
    const path = 'checkin/v1/auth/login';
    const response = await request.post(`${baseUrl}/${path}`, { data: { username, password, version: 0 } });
    if (!response.ok()) {
      throw new ApiError('POST', path, response.status(), undefined, await response.text());
    }
    const body = (await response.json()) as { authToken: string; twoFactorRequired: boolean };
    if (body.twoFactorRequired) {
      throw new Error('EMS login requires 2FA for this account; the API suite needs a non-2FA test admin.');
    }
    return body.authToken;
  }

  readonly reports = {
    totals: (eventId: string) => this.http.get<Totals>(`checkin/v1/events/${eventId}/reports/totals`),

    /** Without `status=ACTIVE` the report also lists cancelled donations. */
    donations: (eventId: string, opts: { status?: 'ACTIVE'; offset?: number; limit?: number } = {}) =>
      this.http.get<DonationReportRow[]>(`checkin/v1/events/${eventId}/reports/donation`, {
        status: opts.status ?? 'ACTIVE',
        offset: opts.offset ?? 0,
        limit: opts.limit ?? 50,
      }),
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
