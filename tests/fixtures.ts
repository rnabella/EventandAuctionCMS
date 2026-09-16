import { test as base, expect } from '@playwright/test';
import { EmsApi } from '../src/api/EmsApi';
import { LiteApi } from '../src/api/LiteApi';
import { readEmsToken, readE2EApiGuestId } from '../src/api/auth';
import { env } from '../src/config/env';
import { Totals } from '../src/api/types';

export interface E2EEvent {
  id: string;
  liteUiBaseUrl: string;
  /** A registered, card-verified guest used by the pure-API donation tests. */
  apiGuestId: string;
  /** The pre-created "QA E2E Ticket" ($20) that api-setup keeps sellable. */
  ticketId: string;
  /** The pre-created "QA E2E Silent Lot" (bidMode "hybrid", minStartPrice $25) that api-setup keeps sellable. */
  lotId: string;
  /** The pre-created "QA E2E Buy Now Lot" ($50) that api-setup keeps sellable. */
  buyNowLotId: string;
  /** The pre-created "QA E2E Sealed Lot" (bidMode "sealed", minStartPrice $25) that api-setup keeps sellable. */
  sealedLotId: string;
  /** The pre-created "QA E2E Raffle" ($10/entry, "3 for $25" bundle) that api-setup keeps sellable. */
  raffleId: string;
}

/**
 * Every e2e/API test that moves fundraising totals follows the same shape: snapshot
 * `reports/totals` before acting, then either poll a specific field's delta as the oracle
 * that the write has landed, or take a fresh read afterward to check several fields at once
 * against that same snapshot. This wraps both without changing either's timing/poll behavior
 * — it was originally envisioned in the fundraising-suite design spec (§4.2) but never built.
 */
export interface TotalsDeltaTracker {
  /** `reports/totals` at the moment this tracker was created. */
  readonly before: Totals;
  /** A fresh, unpolled read of `reports/totals` right now — for comparing several fields against `before` at once, once something else has already confirmed the write landed. */
  now(): Promise<Totals>;
  /** Polls `reports/totals` until `select(current) - select(before)` equals `expectedDelta`. The usual oracle for "the write has landed" before reading anything else. */
  expectDelta(select: (t: Totals) => number, expectedDelta: number, opts?: { timeout?: number }): Promise<void>;
}

type FundraisingFixtures = {
  ems: EmsApi;
  e2eEvent: E2EEvent;
  lite: LiteApi;
  /** Call with the event id at the point a test wants its "before" snapshot taken. */
  totalsDelta: (eventId: string) => Promise<TotalsDeltaTracker>;
};

/**
 * Shared fixtures for tests/api and tests/e2e. `ems` is authenticated with the
 * token written by tests/setup/api.setup.ts (projects depend on `api-setup`).
 */
export const test = base.extend<FundraisingFixtures>({
  ems: async ({ request }, use) => {
    await use(new EmsApi(request, readEmsToken()));
  },
  e2eEvent: async ({}, use) => {
    await use({
      id: env.e2e.eventId,
      liteUiBaseUrl: env.e2e.liteUiBaseUrl,
      // api-setup's ensureApiGuest (src/api/guestFixture.ts) persists a fresh id here only when
      // the static env value stops resolving — prefer it when present, same fallback order it uses.
      apiGuestId: readE2EApiGuestId() ?? env.e2e.apiGuestId,
      ticketId: env.e2e.ticketId,
      lotId: env.e2e.lotId,
      buyNowLotId: env.e2e.buyNowLotId,
      sealedLotId: env.e2e.sealedLotId,
      raffleId: env.e2e.raffleId,
    });
  },
  lite: async ({ request }, use) => {
    await use(new LiteApi(request));
  },
  totalsDelta: async ({ ems }, use) => {
    await use(async (eventId: string) => {
      const before = await ems.reports.totals(eventId);
      return {
        before,
        now: () => ems.reports.totals(eventId),
        expectDelta: async (select, expectedDelta, opts = {}) => {
          await expect
            .poll(async () => select(await ems.reports.totals(eventId)) - select(before), { timeout: opts.timeout ?? 15_000 })
            .toBe(expectedDelta);
        },
      };
    });
  },
});

export { expect };
