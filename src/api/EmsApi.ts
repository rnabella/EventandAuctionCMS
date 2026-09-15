import { APIRequestContext } from '@playwright/test';
import { env } from '../config/env';
import { HttpClient } from './http';
import {
  BidsReportRow,
  CancelledBid,
  CancelledBuyNowPurchase,
  CancelledDonation,
  CancelledGliRafflePurchase,
  CheckinBidResult,
  CheckinBuyNowResult,
  CheckinDonationResult,
  CheckinTicketPurchaseResult,
  DonationReportRow,
  GliRaffleItemsReportRow,
  GuestCheckout,
  IBidGliRaffle,
  IBidGliRaffleUpdate,
  IBidLot,
  IBidLotUpdate,
  IBidTicket,
  IBidTicketUpdate,
  PaymentRecord,
  StripeSubscription,
  Totals,
} from './types';

/**
 * The EMS ("back office") API at env.api.emsBaseUrl. Authenticated with the
 * bearer token returned by `EmsApi.login()` — the same CMS admin credentials.
 */
export class EmsApi {
  /**
   * Exposed (not private) so tests can probe deliberately-invalid payloads
   * that don't belong on the typed `checkin`/`reports`/etc. surfaces — e.g.
   * the forbidden-device GLI raffle purchase case in raffle.api.spec.ts.
   * Prefer the typed methods below for anything that represents a real,
   * supported call shape.
   */
  readonly http: HttpClient;

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

    bids: (eventId: string) => this.http.get<BidsReportRow[]>(`checkin/v1/events/${eventId}/reports/bids`),

    /** Per-raffle sold/raised snapshot. NOT under checkin's reports/ path — a real API quirk, verified live 2026-09-11. */
    gliRaffleItems: (eventId: string) => this.http.get<GliRaffleItemsReportRow[]>(`checkin/v1/events/${eventId}/items/gliRaffles`),
  };

  readonly guests = {
    paymentTransactions: (eventId: string, guestId: string) =>
      this.http.get<PaymentRecord[]>(`checkin/v1/events/${eventId}/guests/${guestId}/payments/transactions`),

    checkout: (eventId: string, guestId: string) =>
      this.http.get<GuestCheckout>(`checkin/v1/events/${eventId}/guests/${guestId}/payments/checkout`),
  };

  /** The CMS's own ticket records (the "iBid" API the CMS Next Tickets pages save through). */
  readonly tickets = {
    get: (eventId: string, ticketId: string) => this.http.get<IBidTicket>(`v1/iBid/events/${eventId}/tickets/${ticketId}`),

    /**
     * Full-record update — send the whole ticket (as returned by `get`) with
     * the changed fields. Send the record from `get` minus
     * `created`/`updated`/`ticketType` — those are rejected (the last one
     * whenever the ticket already has purchases).
     */
    update: (eventId: string, ticketId: string, ticket: IBidTicketUpdate) =>
      this.http.post<unknown>(`v1/iBid/events/${eventId}/tickets/${ticketId}`, ticket),
  };

  /** The CMS's own lot records (the "iBid" API the CMS Next Auction Items pages save through). */
  readonly lots = {
    get: (eventId: string, lotId: string) => this.http.get<IBidLot>(`v1/iBid/events/${eventId}/lots/${lotId}`),

    /** Full-record update — send the whole lot (as returned by `get`) with the changed fields, minus `created`/`updated`/`startPrice` (the last is rejected once the lot has any bids). */
    update: (eventId: string, lotId: string, lot: IBidLotUpdate) =>
      this.http.post<unknown>(`v1/iBid/events/${eventId}/lots/${lotId}`, lot),
  };

  /**
   * The CMS's own GLI raffle records (the "iBid" API the CMS's "Raffles" admin pages,
   * `events/:eventId/gliRaffles/`, save through — NOT the separate, not-yet-built "Prize Draw"
   * feature, which is a different `controller=raffles` resource; see the README's GLI Raffle gotchas).
   */
  readonly gliRaffles = {
    get: (eventId: string, raffleId: string) => this.http.get<IBidGliRaffle>(`v1/iBid/events/${eventId}/gli-raffles/${raffleId}`),

    /**
     * Partial update — unlike `tickets.update`/`lots.update` (full-record POST), this endpoint
     * only accepts PATCH (verified live 2026-09-11: POST 405s, `Allow: GET, HEAD, OPTIONS, PATCH`)
     * and only wants the fields actually changing — echoing back the full record (even minus
     * `created`/`updated`, the tickets/lots pattern) 500s ("Unknown problem"). Send just the
     * changed fields, e.g. `{ numberAvailable, endTime }` (see `raffleFixture.ts`).
     */
    update: (eventId: string, raffleId: string, raffle: Partial<IBidGliRaffleUpdate>) =>
      this.http.patch<unknown>(`v1/iBid/events/${eventId}/gli-raffles/${raffleId}`, raffle),
  };

  /**
   * The CMS's cross-event "Regular Giving" admin list (NOT scoped to one event in its own path —
   * every returned row carries its own eventId/eventName, so callers filter client-side). Same
   * bearer token as every other EmsApi call. Verified live 2026-09-12.
   */
  readonly subscriptions = {
    /**
     * `subscription_status` is verified live to NOT accept an empty string as "match everything" —
     * `subscription_status=` returns `[]` even when active rows exist for the same `q`. The literal
     * string `"all"` was verified live to return the same rows as omitting the param entirely (the
     * only cross-check possible without a cancelled row to test against, since every subscription
     * against the E2E event happened to be active at verification time) — use that, not `''`.
     */
    list: (query: { q?: string; status?: 'active' | 'all'; limit?: number } = {}) =>
      this.http.get<StripeSubscription[]>('v1/iBid/clients/stripe-subscriptions/', {
        view: 'simple',
        limit: query.limit ?? 1000,
        offset: 0,
        subscription_status: query.status === 'all' ? 'all' : 'active',
        q: query.q ?? '',
      }),

    /**
     * Cancels for real on Stripe's side. KNOWN GOTCHA, verified live: `list()`'s `subscriptionStatus`
     * cannot be trusted to reflect a cancellation at all — 3 subscriptions cancelled during
     * exploration on 2026-09-12 still show `active` in the list with no observed window in which it
     * self-corrects. Never assert on this field after calling cancel.
     *
     * Proof-of-cancellation (spot-check technique): retrying `cancel` on an already-cancelled, real
     * record returns HTTP 404 with Stripe's own passthrough error, e.g. `{"code":"Not Found",
     * "message":"No such subscription: 'sub_...'; code: resource_missing; request-id: req_..."}` —
     * this is Stripe itself confirming the underlying subscription is gone, not an EMS-local flag
     * check, so retrying cancel and checking for this specific error is strong evidence the record
     * is gone from Stripe under the account EMS queries (verified live 2026-09-12 and again
     * 2026-09-15 across 5 separate real subscriptions, 5/5 consistent). An earlier note here
     * described the retry response as a generic `{code:"notFound", message:"Subscription not
     * found"}` — every retry against a real, previously-active record observed since has returned
     * Stripe's own error text instead, so treat that shape as the reliable one; the generic message
     * may only appear for a record id that was never valid to begin with.
     *
     * Stronger, more conclusive proof (2026-09-16): checked `guests.paymentTransactions` for the 2
     * oldest cancelled subscriptions in this suite's history (created 2026-09-12,
     * `firstBillingDate: 2026-09-14T00:00:00.000+00:00`, now past) — both guests show ZERO payment
     * transactions. Since retry-404 alone only proves "EMS thinks it's cancelled" (a hypothesized
     * Connect-account-context mismatch could in theory produce a false-404 on retry without Stripe
     * actually having stopped billing), an absent charge on a billing date that has already elapsed
     * directly rules that out — no EMS-local-flag-only false positive could produce it. Prefer this
     * method going forward for any record whose `firstBillingDate` has passed.
     */
    cancel: (eventId: string, recordId: string) =>
      this.http.put<unknown>(`v1/iBid/events/${eventId}/stripe-subscriptions/${recordId}`, {}),
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

    /**
     * Reserves tickets for a guest (unpaid; lands in the guest's checkout basket).
     * Returns a BARE array, and HTTP 200 even when rejected (`code: "soldOut"`).
     */
    purchaseTickets: (eventId: string, guestId: string, body: { ticketId: string; count: number }) =>
      this.http.post<CheckinTicketPurchaseResult[]>(`checkin/v1/events/${eventId}/guests/${guestId}/ticketPurchases`, body),

    /**
     * KNOWN BUG sc-98155 (verified 2026-09-06): this endpoint answers HTTP 500
     * ("There was an error processing your request…") yet the purchase IS cancelled
     * (gone from payments/checkout). Callers must catch ApiError status 500 and
     * verify via the basket. Unknown id → 404 notFound as expected.
     */
    cancelTicketPurchase: (eventId: string, guestId: string, purchaseId: string) =>
      this.http.post<unknown>(`checkin/v1/events/${eventId}/guests/${guestId}/ticketPurchases/cancel`, { id: purchaseId }),

    /**
     * Places a bid on a lot on the guest's behalf. Bare payload, HTTP 200 even
     * when the bid is rejected in-band (`code: "below_minimum" | "below_increase"`).
     * Never appears in `guests.checkout()` — verify via `reports.bids` / `LiteApi.lots`.
     */
    bid: (eventId: string, guestId: string, body: { lotId: string; amount: number; anonymous?: boolean; autoSell?: boolean }) =>
      this.http.post<CheckinBidResult>(`checkin/v1/events/${eventId}/guests/${guestId}/bids`, {
        lotId: body.lotId,
        amount: body.amount,
        anonymous: body.anonymous ?? false,
        showPopup: false,
        liveTAndCAccepted: true,
        autoSell: body.autoSell ?? false,
      }),

    /**
     * Idempotent, unlike cancelTicketPurchase: cancelling an already-cancelled
     * or unknown bid id still returns HTTP 200 "ok" with `entity: null`
     * (verified live 2026-09-07) — never 404.
     */
    cancelBid: (eventId: string, guestId: string, bidId: string) =>
      this.http.post<CancelledBid | null>(`checkin/v1/events/${eventId}/guests/${guestId}/bids/cancel`, { id: bidId }),

    /** Reserves+charges are separate steps for tickets, but a buy-now purchase lands straight in `guests.checkout().buyNowPurchases`. Bare object, not an array. */
    buyNowPurchase: (eventId: string, guestId: string, body: { buyNowId: string; count: number }) =>
      this.http.post<CheckinBuyNowResult>(`checkin/v1/events/${eventId}/guests/${guestId}/buyNowPurchases`, body),

    /** Idempotent, same as cancelBid — HTTP 200 even for an unknown purchase id. */
    cancelBuyNowPurchase: (eventId: string, guestId: string, purchaseId: string) =>
      this.http.post<CancelledBuyNowPurchase | null>(`checkin/v1/events/${eventId}/guests/${guestId}/buyNowPurchases/cancel`, { id: purchaseId }),

    /**
     * Idempotent-ish: cancelling an unknown purchase id 404s with `code: "notFound"` (verified
     * live 2026-09-11) — unlike cancelBid/cancelBuyNowPurchase, which return 200/null for unknown
     * ids. Reverses reports.gliRaffleItems' totalRaised/prizePot and reports.totals.raffles, but
     * NOT reports.gliRaffleItems' bought (see that type's docblock).
     */
    cancelGliRafflePurchase: (eventId: string, guestId: string, purchaseId: string) =>
      this.http.post<CancelledGliRafflePurchase>(`checkin/v1/events/${eventId}/guests/${guestId}/gliRafflePurchases/cancel`, {
        id: purchaseId,
      }),
  };
}
