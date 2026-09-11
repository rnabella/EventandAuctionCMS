# GLI Raffle E2E + API (Fundraising Suite, Slice 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A donor buys one $10 GLI raffle entry on the public Lite UI and pays with a Stripe test card; the EMS API records the paid `gli_raffle_purchase` and the raffle totals bucket rises by exactly that amount — plus an API suite covering the fixture, the Lite public shape, and this feature's real access-control quirk (raffle-purchase creation requires a checked-in device; the checkin API can't originate a purchase the way it can for tickets/bids).

**Architecture:** Extends the existing layers exactly like slices 2/3 did: `EmsApi` gains an iBid `gliRaffles.get/update` pair, a `reports.gliRaffleItems` read (the per-item sold/raised oracle — NOT under `reports/`, it lives at `checkin/v1/events/:eventId/items/gliRaffles`, kept under `EmsApi.reports` anyway since it plays the same oracle role as `reports.bids`), and `checkin.cancelGliRafflePurchase`; `LiteApi` gains `gliRaffles(eventId)`/`gliRaffle(eventId, id)`; `api-setup` gains an idempotent "ensure the fixture raffle is sellable" step; two new Lite page objects drive the raffle detail page and its confirm-purchase step, reusing the existing `CheckoutPage`/`PaymentConfirmationPage` for payment; one new e2e spec and one new API spec follow the slice-1/2 templates (delta-based on `reports.totals`, no cleanup needed — see Global Constraints).

**Tech Stack:** Playwright `^1.62` (`@playwright/test`), TypeScript 7 strict, `dotenv`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-06-fundraising-outcome-suite-design.md` (§4 architecture, §5 test design; raffle wasn't in scope when that doc was written, so every endpoint/locator below was verified fresh via live exploration on 2026-09-11 rather than sourced from that doc — treat this plan, not the spec, as authoritative for raffle facts).

## Global Constraints

- `npm test` (checklist suite) stays untouched and green (38). Fundraising suite stays green and grows: `test:api` 28 → grows, `test:e2e` 6 → grows.
- No new npm dependencies. Money in **cents**. The fixture raffle ("QA E2E Raffle", already created on the E2E event by the user, id `dfccd31e-aba2-11f1-926d-666441e9836d`, displayNumber `41372`) sells **individual entries at $10** and a **"3 for $25" bundle** — this slice only ever buys 1 individual entry ($10); the bundle path is deliberately out of scope (documented as a follow-up, same convention as every other deferred surface in this project).
- Only the E2E event `5a5bef87-a9e7-11f1-90d8-92b18db85c99` / `https://us.test.givergy.com/robteste2eauto1`. `E2E_RAFFLE_ID=dfccd31e-aba2-11f1-926d-666441e9836d`.
- Donor identities from `newE2EDonor()` only (givergy.com `+seed` emails, `xxx-555-xxxx` mobiles). Stripe test card `4242…`. Journey: Lite UI raffle page → Sign in via email → register (card) → opt-ins → confirm purchase (accept terms) → checkout → pay. Same registration/opt-ins/checkout/payment-confirmation page objects as every other Lite journey — nothing new there.
- **GLI raffle purchases behave differently from every other purchasable item in this suite: two report buckets reverse on cancel, one doesn't.** Cancelling a `gliRafflePurchases` purchase (`POST .../guests/:guestId/gliRafflePurchases/cancel`, `{id}`) genuinely reverses `reports/totals.raffles.{raffleEntries,totalRaised,prizePot}` AND `items/gliRaffles[].{totalRaised,prizePot}` back to their pre-purchase values (verified live 2026-09-11: purchase → totals.raffles.totalRaised 0→1000 → cancel → back to 0) — but `items/gliRaffles[].bought` is like tickets' `itemsSold`: it never reverses, permanently incremented. This plan follows the **donations/tickets precedent, not the auction precedent**: since the totals/raised buckets are correctly delta-provable and nothing here is a scarce single shared fixture requiring a reset (unlike lots' "No Bids Yet" state), **the e2e journey does NOT cancel its purchase afterward** — it accumulates in `raffles.totalRaised`/`raffleEntries` exactly like the donations spec lets `donation.raised` accumulate forever. Assert on deltas (`after.X - before.X`), never on absolute values.
- **The check-in API cannot originate a GLI raffle purchase the way it can for tickets/bids/buy-now.** `POST checkin/v1/events/:eventId/guests/:guestId/gliRafflePurchases` requires a `deviceId` field; a made-up/unregistered device id gets HTTP 200 `{"code":"forbidden","message":"Forbidden access"}` (verified live 2026-09-11 — not a 4xx, an in-band `forbidden` code), and there is no discoverable API to list a valid device id (`GET .../rsu-devices` is `405 Method Not Allowed`; it's a POST-only search endpoint not otherwise explored — out of scope to pursue further). Consequently, **unlike tickets.api.spec.ts's "reserve then cancel" pattern, the API suite cannot create a real raffle purchase directly** — creation only happens through the Lite UI (the e2e spec). The API spec instead: (a) confirms the fixture is sellable, (b) confirms the Lite public API's shape, (c) pins the `forbidden` behavior as a documented fact, (d) confirms cancelling an unknown purchase id 404s. `EmsApi.checkin.cancelGliRafflePurchase` is still implemented (and used by the e2e spec's `finally`... except see the point above — it is NOT used there either, since this slice doesn't cancel; it exists for the negative-path test and for any future caller).
- **Terminology trap, already hit once while exploring:** the Lite UI has THREE distinct, unrelated features that all sound like "raffle": **Silent Auction** (`controller=lots`, slice 3, done), **Raffle** (`controller=gliRaffles`, THIS slice — GLI-licensed, has `bundles`, `raffleMode`, `licenceNumber` fields, a real regulated raffle), and **Prize Draw** (`controller=raffles`, a *different*, not-yet-built feature with its own `prizeDrawPurchases` guest endpoint and its own `reports/totals` semantics — confirmed empty/unrelated during this exploration, e.g. `guests/:g/payments/checkout` has both a `gliRaffles[]` array and a separate, always-empty-so-far `prizeDrawPurchases[]` array). Never conflate `gliRaffles`/`gli-raffles` (this slice) with `raffles`/`prizeDrawPurchases` (a future slice, per the suite's slice order: "raffle (GLI) → prize draw").
- API tests that would mutate guest state are constrained by the device requirement above; the one test that touches real money (the e2e spec) runs in `test:e2e`'s existing `--workers=1` serial project. Nothing secret committed (`.env`, `playwright/.auth/` gitignored). Commits end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `.env.example`, `.env` (local) (modify) | `E2E_RAFFLE_ID` |
| `src/config/env.ts` (modify) | `env.e2e.raffleId` |
| `src/api/types.ts` (modify) | `IBidGliRaffle`, `IBidGliRaffleBundle`, `LiteGliRaffle` (the enveloped detail shape: `cachedGliRaffle`/`gliBundleList`/`numberLeft`/`bundleNumberLeft`/`totalNumberLeft`/`totalRaisedAmount`), `GliRaffleItemsReportRow`, `CheckoutGliRafflePurchase`, `CancelledGliRafflePurchase`; add `raffles: { totalItems, raffleEntries, jackpotEntries, prizeEntries, totalRaised, prizePot }` is ALREADY on `Totals` (present, unused until now — confirm, don't re-add); add `GuestCheckout.gliRaffles: CheckoutGliRafflePurchase[]` |
| `src/api/LiteApi.ts` (modify) | `gliRaffles(eventId)`, `gliRaffle(eventId, id)` |
| `src/api/EmsApi.ts` (modify) | `gliRaffles.get/update` (iBid), `reports.gliRaffleItems`, `checkin.cancelGliRafflePurchase` |
| `src/api/raffleFixture.ts` (create) | `ensureRaffleSellable(ems, eventId, raffleId)` |
| `tests/setup/api.setup.ts` (modify) | call `ensureRaffleSellable` after login |
| `tests/fixtures.ts` (modify) | `e2eEvent.raffleId` |
| `tests/api/raffle.api.spec.ts` (create) | fixture sellability, Lite public shape, forbidden-device pin, unknown-id cancel 404 |
| `src/pages/lite/raffle/RafflePage.ts` (create) | `?controller=gliRaffles&action=showRaffle`: per-option +/- quantity, Buy Tickets |
| `src/pages/lite/raffle/ConfirmRafflePurchasePage.ts` (create) | `?controller=gliRaffles&action=confirmRafflePurchase`: accept terms, Save & Buy Tickets |
| `tests/e2e/raffle.spec.ts` (create) | the raffle journey verified via EMS API |
| `README.md` (modify) | coverage, fixture, gotchas (forbidden-device, bought-never-reverses, three-similar-features trap) |

---

### Task 1: Raffle config, types, and API client methods

**Files:**
- Modify: `.env.example`, `.env` (local only), `src/config/env.ts`, `src/api/types.ts`, `src/api/LiteApi.ts`, `src/api/EmsApi.ts`
- Test: `tests/api/raffle.api.spec.ts` (created in this task, grown in Task 3)

**Interfaces:**
- Consumes: `HttpClient` (`get<T>/post<T>`), `env.e2e.eventId`, existing `EmsApi`/`LiteApi` classes.
- Produces: `env.e2e.raffleId: string`; types below; `LiteApi.gliRaffles(eventId): Promise<LiteGliRaffle[]>`; `LiteApi.gliRaffle(eventId, id): Promise<LiteGliRaffle>`; `EmsApi.gliRaffles.get(eventId, raffleId): Promise<IBidGliRaffle>`; `EmsApi.gliRaffles.update(eventId, raffleId, raffle): Promise<unknown>`; `EmsApi.reports.gliRaffleItems(eventId): Promise<GliRaffleItemsReportRow[]>`; `EmsApi.checkin.cancelGliRafflePurchase(eventId, guestId, purchaseId): Promise<unknown>`.

- [ ] **Step 1: Add the env var**

Append to `.env.example` and `.env` (in the fundraising block, after `E2E_SEALED_LOT_ID`):

```
# The pre-created "QA E2E Raffle" ($10/entry, "3 for $25" bundle) on the E2E event; api-setup keeps it sellable.
E2E_RAFFLE_ID=dfccd31e-aba2-11f1-926d-666441e9836d
```

In `src/config/env.ts`, inside `e2e: { … }`, add after `sealedLotId`:

```ts
    raffleId: required('E2E_RAFFLE_ID'),
```

- [ ] **Step 2: Write the failing test**

Create `tests/api/raffle.api.spec.ts`:

```ts
import { test, expect } from '../fixtures';

test.describe('EMS iBid API > fixture raffle', () => {
  test('the fixture raffle is on sale: active, $10/entry, in stock, far-future sale end', async ({ ems, e2eEvent }) => {
    const raffle = await ems.gliRaffles.get(e2eEvent.id, e2eEvent.raffleId);
    expect(raffle).toMatchObject({ id: e2eEvent.raffleId, status: 'active', hidden: false, price: 1000 });
    expect(raffle.numberAvailable).toBeGreaterThanOrEqual(1);
    expect(Date.parse(raffle.endTime)).toBeGreaterThan(Date.now());
  });

  test('the fixture raffle is listed on the public site with the same price and a bundle', async ({ lite, e2eEvent }) => {
    const raffle = await lite.gliRaffle(e2eEvent.id, e2eEvent.raffleId);
    expect(raffle.cachedGliRaffle).toMatchObject({ id: e2eEvent.raffleId, status: 'active', hidden: false, price: 1000 });
    expect(raffle.numberLeft).toBeGreaterThanOrEqual(1);
    expect(raffle.gliBundleList.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=api raffle`
Expected: FAIL — TypeScript errors: `Property 'gliRaffles' does not exist on type 'EmsApi'`, `Property 'raffleId' does not exist`, `Property 'gliRaffle' does not exist on type 'LiteApi'`.

- [ ] **Step 4: Add the types**

Append to `src/api/types.ts`:

```ts
/** GET/POST ems/v1/iBid/events/:eventId/gli-raffles/:raffleId (enveloped) — the CMS's own raffle record. */
export interface IBidGliRaffle {
  id: string;
  eventId: string;
  displayNumber: string;
  title: string;
  status: 'active' | string;
  hidden: boolean;
  shortId: string;
  price: number; // cents, the per-individual-entry price
  numberAvailable: number;
  startTime: string;
  endTime: string;
  created?: string;
  updated?: string;
  raffleMode: 'regular_prize_draw' | string;
  minimumAge: number;
  countryRegion: string;
  jurisdiction?: string;
  licenceNumber: string;
  licensee: string;
  splitPercentage: number;
  currencyCode: string;
  started: boolean;
  suspended: boolean;
  bundles?: IBidGliRaffleBundle[];
  [key: string]: unknown; // the full record has ~50 more admin-only fields never touched by this suite
}

export type IBidGliRaffleUpdate = Omit<IBidGliRaffle, 'created' | 'updated'>;

export interface IBidGliRaffleBundle {
  id: string;
  title: string; // e.g. "3 for $25"
  count: number; // entries per bundle
  price: number; // cents
  numberAvailable: number;
  status: 'active' | string;
}

/** GET lite/v1/events/:eventId/gli-raffles(/:id) (enveloped) — the public site's raffle detail. */
export interface LiteGliRaffle {
  cachedGliRaffle: {
    id: string;
    displayNumber: string;
    title: string;
    status: 'active' | string;
    hidden: boolean;
    price: number;
    minimumAge: number;
    startTime: string;
    endTime: string;
  };
  gliBundleList: Array<{ id: string; title: string; count: number; price: number; numberLeft: number; numberAvailable: number }>;
  totalRaisedAmount: number;
  prizeAmount: number;
  numberLeft: number; // remaining individual-entry stock
  bundleNumberLeft: number;
  totalNumberLeft: number; // numberLeft + bundleNumberLeft
}

/** GET checkin/v1/events/:eventId/items/gliRaffles (BARE array) — the per-raffle sold/raised oracle, same role as BidsReportRow for lots. */
export interface GliRaffleItemsReportRow {
  id: string;
  number: string;
  title: string;
  price: number;
  available: number;
  bought: number; // NEVER reverses on cancel (same quirk as tickets' itemsSold) — delta-assert, don't compare to an absolute value across a cancel
  bundles: Array<{ id: string; title: string; price: number; available: number; bought: number; count: number }>;
  minAge: number;
  jurisdiction: string;
  prizePot: number; // DOES reverse on cancel
  totalRaised: number; // DOES reverse on cancel
}

/** One line of GuestCheckout.gliRaffles */
export interface CheckoutGliRafflePurchase {
  itemId: string; // raffle id
  purchaseId: string;
  title: string;
  itemNumber: string;
  itemAmount: number;
  itemCount: number;
  totalAmount: number;
  baseTotal: number;
  subTotal: number;
}

/** POST .../gliRafflePurchases/cancel response */
export interface CancelledGliRafflePurchase {
  id: string;
  gliRaffleId: string;
  code: 'cancelled' | string;
  bundleId: string | null;
  amount: number;
  count: number;
}
```

Add `gliRaffles: CheckoutGliRafflePurchase[];` to the existing `GuestCheckout` interface (alongside `donations`/`ticketPurchases`/`buyNowPurchases`).

- [ ] **Step 5: Add the API client methods**

In `src/api/LiteApi.ts`, add after `lots(eventId)`:

```ts
  /** Every GLI raffle currently shown on the public site. */
  gliRaffles(eventId: string) {
    return this.http.get<LiteGliRaffle[]>(`v1/events/${eventId}/gli-raffles`);
  }

  /** One raffle's detail (same shape each array element in gliRaffles() has, per the live API — confirm during implementation). */
  gliRaffle(eventId: string, raffleId: string) {
    return this.http.get<LiteGliRaffle>(`v1/events/${eventId}/gli-raffles/${raffleId}`);
  }
```

Import `LiteGliRaffle` in the top-of-file import list.

In `src/api/EmsApi.ts`:
- Import `IBidGliRaffle`, `IBidGliRaffleUpdate`, `GliRaffleItemsReportRow`, `CancelledGliRafflePurchase` from `./types`.
- Add a new group after `readonly lots = { … };`:

```ts
  /** The CMS's own GLI raffle records (the "iBid" API the CMS Next Prize Draws pages save through). */
  readonly gliRaffles = {
    get: (eventId: string, raffleId: string) => this.http.get<IBidGliRaffle>(`v1/iBid/events/${eventId}/gli-raffles/${raffleId}`),
    update: (eventId: string, raffleId: string, raffle: IBidGliRaffleUpdate) =>
      this.http.post<unknown>(`v1/iBid/events/${eventId}/gli-raffles/${raffleId}`, raffle),
  };
```

- Add inside `readonly reports = { … }`, after `bids`:

```ts
    /** Per-raffle sold/raised snapshot. NOT under checkin's reports/ path — a real API quirk, verified live 2026-09-11. */
    gliRaffleItems: (eventId: string) => this.http.get<GliRaffleItemsReportRow[]>(`checkin/v1/events/${eventId}/items/gliRaffles`),
```

- Add inside `readonly checkin = { … }`, after `cancelBuyNowPurchase`:

```ts
    /**
     * Idempotent-ish: cancelling an unknown purchase id 404s (verified live 2026-09-11) — unlike
     * cancelBid/cancelBuyNowPurchase, which return 200/null for unknown ids. Reverses
     * reports.gliRaffleItems' totalRaised/prizePot and reports.totals.raffles, but NOT
     * reports.gliRaffleItems' bought (see that type's docblock).
     */
    cancelGliRafflePurchase: (eventId: string, guestId: string, purchaseId: string) =>
      this.http.post<CancelledGliRafflePurchase>(`checkin/v1/events/${eventId}/guests/${guestId}/gliRafflePurchases/cancel`, {
        id: purchaseId,
      }),
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx playwright test --project=api-setup --project=api raffle`
Expected: PASS (2 tests). If the Lite `gliRaffle()` single-item shape differs from the array-element shape assumed above, fix `LiteGliRaffle` to match what the live response actually returns — verify with `curl https://us.test.givergy.com/lite/v1/events/5a5bef87-a9e7-11f1-90d8-92b18db85c99/gli-raffles/dfccd31e-aba2-11f1-926d-666441e9836d` before changing the type blindly.

- [ ] **Step 7: Commit**

`feat(api): GLI raffle types and EMS/Lite clients`

---

### Task 2: Self-healing raffle fixture + api-setup wiring

**Files:**
- Create: `src/api/raffleFixture.ts`
- Modify: `tests/setup/api.setup.ts`, `tests/fixtures.ts`
- Test: extend `tests/api/raffle.api.spec.ts`

**Interfaces:**
- Consumes: `EmsApi.gliRaffles.get/update`.
- Produces: `ensureRaffleSellable(ems, eventId, raffleId): Promise<IBidGliRaffle>`; `E2EEvent.raffleId: string`.

- [ ] **Step 1: Write the failing test**

Append to `tests/api/raffle.api.spec.ts`:

```ts
test('api-setup leaves the fixture raffle sellable for at least a month', async ({ ems, e2eEvent }) => {
  const raffle = await ems.gliRaffles.get(e2eEvent.id, e2eEvent.raffleId);
  const DAY_MS = 86_400_000;
  expect(raffle).toMatchObject({ id: e2eEvent.raffleId, status: 'active', hidden: false, price: 1000 });
  expect(raffle.numberAvailable).toBeGreaterThanOrEqual(100);
  expect((Date.parse(raffle.endTime) - Date.now()) / DAY_MS).toBeGreaterThan(30);
});
```

Run: `npx playwright test --project=api api-setup raffle` → currently passes by luck (the raffle already has 498 left / endTime 2030) but add it anyway as a permanent regression guard, same role as `ticketFixture`'s equivalent test — the next several steps make it a real, healed guarantee rather than a lucky snapshot.

- [ ] **Step 2: Write `raffleFixture.ts`**

```ts
import { EmsApi } from './EmsApi';
import { IBidGliRaffle } from './types';

/** Below this the fixture is topped back up to 1000 (each e2e run consumes 1 individual entry). */
export const SELLABLE_MIN_AVAILABLE = 100;
/** Below this many days of sale window left, the sale end is pushed out again. */
export const SELLABLE_MIN_DAYS_LEFT = 30;
const RESTOCK_TO = 1000;
const FAR_FUTURE_END = '2030-12-31T23:00:00.000+00:00';
const DAY_MS = 86_400_000;

function isSellable(r: IBidGliRaffle): boolean {
  const daysLeft = (Date.parse(r.endTime) - Date.now()) / DAY_MS;
  return r.status === 'active' && !r.hidden && r.numberAvailable >= SELLABLE_MIN_AVAILABLE && daysLeft >= SELLABLE_MIN_DAYS_LEFT;
}

/**
 * Idempotently keeps the pre-created fixture raffle purchasable on the public
 * site, the same role ensureTicketSellable/ensureLotSellable play for their
 * fixtures. numberAvailable is the raffle's declared individual-entry stock
 * (permanently reduced by every real purchase, cancelled or not — see
 * GliRaffleItemsReportRow's docblock), so without this the raffle journey
 * would eventually start failing exactly like an un-healed ticket would.
 * Only the top-level individual-entry stock is healed; the "3 for $25" bundle
 * is out of scope (this suite never purchases it — see the plan's Global
 * Constraints).
 */
export async function ensureRaffleSellable(ems: EmsApi, eventId: string, raffleId: string): Promise<IBidGliRaffle> {
  const raffle = await ems.gliRaffles.get(eventId, raffleId);
  if (isSellable(raffle)) {
    return raffle;
  }
  const { created, updated, ...editable } = raffle;
  void created; void updated;
  await ems.gliRaffles.update(eventId, raffleId, {
    ...editable,
    status: 'active',
    hidden: false,
    numberAvailable: Math.max(raffle.numberAvailable, RESTOCK_TO),
    endTime: FAR_FUTURE_END,
  });
  const after = await ems.gliRaffles.get(eventId, raffleId);
  if (!isSellable(after)) {
    throw new Error(
      `Fixture raffle ${raffleId} is still not sellable after an iBid update ` +
        `(status=${after.status} hidden=${after.hidden} numberAvailable=${after.numberAvailable} endTime=${after.endTime}). ` +
        `Fix it in the CMS: events/${eventId}/prizeDraws/edit/?id=${raffleId} (or wherever GLI raffles are edited — confirm the real CMS path during implementation).`,
    );
  }
  return after;
}
```

Note for the implementer: confirm during implementation whether the iBid update payload needs any field excluded the way tickets exclude `ticketType` (rejected once purchases exist) — test by calling `ensureRaffleSellable` against the live fixture (which already has purchases/cancellations against it) and checking the response isn't an error. If a field is rejected, exclude it the same way and document why in a comment, matching `ticketFixture.ts`'s pattern.

- [ ] **Step 3: Wire into api-setup**

In `tests/setup/api.setup.ts`, import `ensureRaffleSellable` from `../../src/api/raffleFixture` and add after the sealed-lot line:

```ts
  // Slice 4: the raffle journey needs the fixture raffle in stock and on sale.
  await ensureRaffleSellable(ems, env.e2e.eventId, env.e2e.raffleId);
```

- [ ] **Step 4: Add to fixtures.ts**

In `tests/fixtures.ts`, add to the `E2EEvent` interface (after `sealedLotId`):

```ts
  /** The pre-created "QA E2E Raffle" ($10/entry) that api-setup keeps sellable. */
  raffleId: string;
```

And to the `e2eEvent` fixture's returned object: `raffleId: env.e2e.raffleId,`.

- [ ] **Step 5: Run it to verify it passes**

Run: `npx playwright test --project=api-setup --project=api raffle`
Expected: PASS (4 tests total in this file so far).

- [ ] **Step 6: Commit**

`feat(api-setup): keep the fixture raffle sellable via the iBid API`

---

### Task 3: API suite — the forbidden-device and unknown-id facts

**Files:**
- Modify: `tests/api/raffle.api.spec.ts`

**Interfaces:**
- Consumes: `ems.checkin.cancelGliRafflePurchase`, `HttpClient`'s raw request path for the one-off forbidden-device probe (see below — this test calls the endpoint directly rather than through a typed client method, since the payload it sends is deliberately invalid and isn't a shape any real caller should use).

- [ ] **Step 1: Write the tests**

Append to `tests/api/raffle.api.spec.ts`:

```ts
test.describe('EMS check-in API > GLI raffle purchases — access control and validation', () => {
  test('creating a purchase with an unregistered device id is rejected (forbidden), not accepted', async ({ ems, e2eEvent }) => {
    // Documents a real, deliberate constraint of this endpoint: unlike checkin.purchaseTickets/bid/
    // buyNowPurchase, a GLI raffle purchase can only be originated by a device the event's check-in
    // system recognises. There is no discoverable API to obtain a valid one (rsu-devices is POST-only,
    // undocumented, out of scope) — so this suite can never exercise the "real" create path directly;
    // only the Lite UI (tests/e2e/raffle.spec.ts) can. This test exists so a future change in that
    // behavior (e.g. it starts silently succeeding) fails loudly here instead of nowhere.
    const res = await ems.http.postRaw(
      `checkin/v1/events/${e2eEvent.id}/guests/${e2eEvent.apiGuestId}/gliRafflePurchases`,
      { gliRaffleId: e2eEvent.raffleId, bundleId: null, count: 1, deviceId: '00000000-0000-0000-0000-000000000001' },
    );
    expect(res).toMatchObject({ code: 'forbidden' });
  });

  test('cancelling an unknown purchase id 404s', async ({ ems, e2eEvent }) => {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    await expect(ems.checkin.cancelGliRafflePurchase(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Check whether `HttpClient` already exposes a raw/untyped POST**

Read `src/api/http.ts` first. If `HttpClient` has no method that returns the raw parsed body without throwing on an in-band `forbidden` code (i.e. it only throws on HTTP-level errors, and `forbidden` here is HTTP 200 with an in-band code — confirmed live 2026-09-11), then `this.http.post<{code: string}>(...)` already works without needing a new `postRaw` method — use that directly and drop the `ems.http.postRaw` idea above; adjust the test to call a small inline helper or add a one-off method. Do NOT add a general-purpose "raw" escape hatch to `EmsApi.checkin` for a one-time probe — prefer a local `test`-file-scoped helper using the existing typed `post` if it already tolerates in-band error codes (it does, per `checkin.bid`'s docblock: "HTTP 200 even when the bid is rejected in-band"). Simplify Step 1's test accordingly once you've confirmed this — most likely it becomes:

```ts
  test('creating a purchase with an unregistered device id is rejected (forbidden), not accepted', async ({ ems, e2eEvent }) => {
    const res = await ems.http.post<{ code: string }>(
      `checkin/v1/events/${e2eEvent.id}/guests/${e2eEvent.apiGuestId}/gliRafflePurchases`,
      { gliRaffleId: e2eEvent.raffleId, bundleId: null, count: 1, deviceId: '00000000-0000-0000-0000-000000000001' },
    );
    expect(res).toMatchObject({ code: 'forbidden' });
  });
```

(`ems.http` may be private — check, and either loosen it to `readonly` + accessible, or add a one-line passthrough. Prefer the smallest change that avoids inventing a whole new "unsafe purchase" method on the public `EmsApi.checkin` surface, since that surface implies "this is how you're meant to create a purchase," which isn't true here.)

- [ ] **Step 3: Run it to verify it passes**

Run: `npx playwright test --project=api-setup --project=api raffle`
Expected: PASS (6 tests total in this file).

- [ ] **Step 4: Commit**

`test(api): pin the GLI raffle forbidden-device constraint and unknown-purchase-id 404`

---

### Task 4: Lite page objects — raffle detail and confirm-purchase

**Files:**
- Create: `src/pages/lite/raffle/RafflePage.ts`, `src/pages/lite/raffle/ConfirmRafflePurchasePage.ts`

**Interfaces:**
- Consumes: `LiteBasePage`.
- Produces: `RafflePage.goto(displayNumber)`, `RafflePage.addIndividualEntry(count)`, `RafflePage.buyTickets()`; `ConfirmRafflePurchasePage.confirmPurchase()`.

Live-verified DOM facts (2026-09-11), so this task should need little further exploration:
- Raffle detail page: `?controller=gliRaffles&action=showRaffle&id=<displayNumber>` (the raffle's `displayNumber`, e.g. `41372` — NOT its UUID). Heading is `Raffle` (also the label of an unrelated nav dropdown item — scope the locator, e.g. to an `<h1>` or the page's main content, not `getByRole('heading', {name: 'Raffle'})` alone if that turns out ambiguous; verify live).
- Each purchasable option (the bundle AND the individual-entry option) renders as a `.addOrRemoveItem` block containing a `.addOrRemoveItem__title` div with exact text (`"3 for $25"`, `"1 ticket for $10"`) and, inside it, two `<button title="Add">`/`<button title="Remove">` elements (no accessible name, but a real `title` attribute — confirmed live, use `getByTitle('Add')`/`getByTitle('Remove')`, not class selectors, since MUI/this-framework's classes are the kind that have broken before in this project).
- One page-level `<button name="buyNow">Buy Tickets</button>` (not per-option) submits the current selection.
- Buy Tickets → sign-in (`?controller=guest&action=checkRegistration&…&redirect=…action%3DconfirmRafflePurchase%26id%3D<raffleUuid>`, note: this redirect embeds the raffle's UUID, not its displayNumber) → register → opt-ins (all three: reuse `LiteSignInPage`/`LiteRegisterPage`/`OptInsPage` verbatim, no changes needed).
- Confirm page: `?controller=gliRaffles&action=confirmRafflePurchase&id=<raffleUuid>`. Body: "Please Confirm Your Ticket Purchase Below", one `input[type=checkbox]` ("I accept Terms and Conditions*" — no separate label association confirmed; verify live whether `getByRole('checkbox')` resolves it directly, else fall back to `.locator('input[type=checkbox]').first()` the way this plan's exploration did), and `<button name="normalBid">Save & Buy Tickets</button>`. Clicking it POSTs `lite/v1/events/:id/gli-raffle/purchases` (note: singular `gli-raffle`, hyphenated — differs from the plural/list endpoints) with `{raffleId, bundleId, count, addedOn:false}`, then navigates to `?controller=guest&action=checkout` — the existing `CheckoutPage`.

- [ ] **Step 1: `RafflePage.ts`**

```ts
import { LiteBasePage } from '../LiteBasePage';

/** `?controller=gliRaffles&action=showRaffle&id=<displayNumber>` — a single GLI raffle's detail/purchase page. */
export class RafflePage extends LiteBasePage {
  readonly buyTicketsButton = this.page.locator('button[name="buyNow"]');

  async goto(displayNumber: string): Promise<void> {
    await this.gotoLite('gliRaffles', 'showRaffle', { id: displayNumber });
    await this.buyTicketsButton.waitFor();
  }

  private option(label: string) {
    return this.page.locator('.addOrRemoveItem').filter({ hasText: label });
  }

  /** `label` must match an option's exact title text, e.g. "1 ticket for $10" or "3 for $25". */
  async addQuantity(label: string, count: number): Promise<void> {
    const addButton = this.option(label).getByTitle('Add');
    for (let i = 0; i < count; i++) {
      await addButton.click();
    }
  }

  async buyTickets(): Promise<void> {
    await this.buyTicketsButton.click();
  }
}
```

(Adjust the confirm-page-heading/checkbox-locator details below to whatever a quick live check-in-browser confirms — the plan's exploration used `force: true` clicks throughout because of `tabletMode`/CSS quirks seen elsewhere in this codebase; keep that convention unless a live check shows it's unnecessary here.)

- [ ] **Step 2: `ConfirmRafflePurchasePage.ts`**

```ts
import { LiteBasePage } from '../LiteBasePage';

/** `?controller=gliRaffles&action=confirmRafflePurchase&id=<raffleUuid>` — "Please Confirm Your Ticket Purchase Below". */
export class ConfirmRafflePurchasePage extends LiteBasePage {
  readonly termsCheckbox = this.page.locator('input[type=checkbox]').first();
  readonly confirmButton = this.page.getByRole('button', { name: 'Save & Buy Tickets' });

  async confirmPurchase(): Promise<void> {
    await this.confirmButton.waitFor();
    await this.termsCheckbox.check({ force: true });
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/gli-raffle\/purchases(\?|$)/.test(r.url()),
      ),
      this.confirmButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string };
    if (body.code !== 'ok') {
      throw new Error(`Raffle purchase failed: ${body.code} — ${body.message}`);
    }
  }
}
```

- [ ] **Step 3: Sanity-check both page objects manually**

Before writing the e2e spec, do a quick throwaway script (same technique used to explore this feature live — `chromium.launch()` against the E2E event) that: navigates `RafflePage`, adds 1 to `"1 ticket for $10"`, clicks Buy Tickets, completes sign-in/register/opt-ins (reuse the existing page objects), lands on `ConfirmRafflePurchasePage`, calls `confirmPurchase()`, and confirms it reaches `?controller=guest&action=checkout`. This is exploration, not a committed test — delete the script afterward. Only proceed to Task 5 once this works end-to-end against the live environment.

- [ ] **Step 4: Commit**

`feat(lite): raffle detail and confirm-purchase page objects`

---

### Task 5: The e2e journey

**Files:**
- Create: `tests/e2e/raffle.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4, plus `LiteSignInPage`, `LiteRegisterPage`, `OptInsPage`, `CheckoutPage`, `PaymentConfirmationPage` (all unchanged, reused verbatim).

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { RafflePage } from '../../src/pages/lite/raffle/RafflePage';
import { ConfirmRafflePurchasePage } from '../../src/pages/lite/raffle/ConfirmRafflePurchasePage';
import { CheckoutPage } from '../../src/pages/lite/CheckoutPage';
import { PaymentConfirmationPage } from '../../src/pages/lite/PaymentConfirmationPage';

// Serial within the file; `npm run test:e2e` runs lite-e2e with --workers=1.
test.describe.serial('Lite UI > GLI Raffle (donor journey, verified via the EMS API)', () => {
  test('a new donor buys one $10 raffle entry with a test card, and the EMS API records the paid gli_raffle_purchase', async ({
    page,
    ems,
    lite,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();
    const raffle = await ems.gliRaffles.get(e2eEvent.id, e2eEvent.raffleId);
    const price = raffle.price; // 1000
    const totalsBefore = await ems.reports.totals(e2eEvent.id);
    const itemsBefore = (await ems.reports.gliRaffleItems(e2eEvent.id)).find((r) => r.id === e2eEvent.raffleId);
    expect(itemsBefore, 'fixture raffle not found in items/gliRaffles').toBeDefined();

    // 1. Pick one individual entry
    const rafflePage = new RafflePage(page);
    await rafflePage.goto(raffle.displayNumber);
    await rafflePage.addQuantity('1 ticket for $10', 1);
    await rafflePage.buyTickets();

    // 2. Register
    await new LiteSignInPage(page).continueWithEmail(donor.email);
    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    await new OptInsPage(page).continueWithDefaults();

    // 3. Confirm the purchase (accept terms), then pay exactly $10.00
    await page.waitForURL(/action=confirmRafflePurchase/, { timeout: 30_000 });
    await new ConfirmRafflePurchasePage(page).confirmPurchase();

    const checkout = new CheckoutPage(page);
    await checkout.waitForPage();
    await checkout.setCoverProcessingFee(false);
    await checkout.expectTotalPayment(price);
    await checkout.payWithSavedCard();
    await new PaymentConfirmationPage(page).expectSuccess(price);

    // 4. Verify through the EMS API
    await expect
      .poll(
        async () =>
          (await ems.guests.paymentTransactions(e2eEvent.id, guestId))
            .filter((p) => p.status === 'paid')
            .reduce((sum, p) => sum + p.amount, 0),
        { timeout: 15_000 },
      )
      .toBe(price);
    const [payment] = await ems.guests.paymentTransactions(e2eEvent.id, guestId);
    expect(payment).toMatchObject({ status: 'paid', processor: 'stripe', amount: price, cardLast4: '4242', currency: 'USD' });
    expect(payment.paymentTransactions).toContainEqual(
      expect.objectContaining({ recordType: 'gli_raffle_purchase', itemId: e2eEvent.raffleId, amountPaid: price, paymentStatus: 'paid', itemCount: 1 }),
    );

    const outstanding = await ems.guests.checkout(e2eEvent.id, guestId);
    expect(outstanding.gliRaffles).toEqual([]);
    expect(outstanding.grandTotal).toBe(0);

    // Deltas only — see the plan's Global Constraints (this purchase is intentionally never cancelled).
    const totalsAfter = await ems.reports.totals(e2eEvent.id);
    expect(totalsAfter.raffles.totalRaised - totalsBefore.raffles.totalRaised).toBe(price);
    expect(totalsAfter.raffles.raffleEntries - totalsBefore.raffles.raffleEntries).toBe(1);
    expect(totalsAfter.totalRaised - totalsBefore.totalRaised).toBe(price);

    const itemsAfter = (await ems.reports.gliRaffleItems(e2eEvent.id)).find((r) => r.id === e2eEvent.raffleId);
    expect(itemsAfter!.bought - itemsBefore!.bought).toBe(1);
    expect(itemsAfter!.totalRaised - itemsBefore!.totalRaised).toBe(price);
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run: `npx playwright test --project=api-setup --project=lite-e2e raffle`
Expected: PASS. If `expectTotalPayment`/`payWithSavedCard` behave differently here than in the donation journey (e.g. a raffle-specific fee label), adjust — but per the exploration in this plan, the checkout/payment flow was identical to the donation/ticket flow once the item is in the basket, so no changes to `CheckoutPage`/`PaymentConfirmationPage` are expected.

- [ ] **Step 3: Run the full fundraising suite**

Run: `npm run test:fundraising` (api then lite-e2e). Expected: `test:api` 34, `test:e2e` 7, all green. Also run `npm test` (checklist suite) once to confirm it's still untouched at 38.

- [ ] **Step 4: Commit**

`feat(lite): GLI raffle purchase journey; complete donor flow verified via EMS API`

---

### Task 6: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update coverage counts and structure**

Add the raffle slice to whatever "Current coverage" / "Structure" sections list slices 1–3, following their exact format (files added, test counts, one-paragraph summary).

- [ ] **Step 2: Document the gotchas found in this slice**

Add to "Testing gotchas worth knowing before extending this further" (or nearest equivalent section):
1. **Three similarly-named features**: Silent Auction (`lots`) / Raffle (`gliRaffles`, GLI-licensed) / Prize Draw (`raffles`, `prizeDrawPurchases` — not yet built). Never conflate.
2. **GLI raffle purchases can't be created via the check-in API** the way tickets/bids/buy-now can — `deviceId` is required and access-controlled (`forbidden` for any id this suite can obtain). Only the Lite UI can create one; the API suite is read-only + negative-path here.
3. **`items/gliRaffles.bought` never reverses on cancel; `totalRaised`/`prizePot` do** — the same permanent-counter/reversible-total split seen with tickets' `itemsSold`, but this time on the SAME endpoint, so it's easy to assert the wrong field. Always re-check which field you're asserting against after a cancel.
4. **This slice deliberately never cancels its e2e purchase** — follows the donations/tickets precedent (accumulate + delta-assert), not the auction precedent (single shared fixture, must reset). Document why so a future contributor doesn't "fix" this by adding a cancel that isn't needed.
5. Any other real surprise hit during Tasks 1–5 that wasn't foreseeable from this plan (there almost always is at least one — e.g. `IBidGliRaffleUpdate`'s excluded fields, or the confirm-page checkbox's actual accessible name/role). Document it here, following the exact tone/format of the existing entries (concrete, dated, "verified live").

- [ ] **Step 3: Commit**

`docs: GLI raffle slice — coverage, fixture, access-control and cancel-semantics gotchas`

---

## Follow-ups (out of scope for this plan, ledger only)

- The "3 for $25" bundle purchase path (`bundleId` set, `count` = number of bundles) — never exercised.
- `rsu-devices` / obtaining a real device id — would unlock a pure-API "reserve+cancel" test mirroring tickets.api.spec.ts; not pursued (out of scope, undocumented POST-only endpoint).
- Prize Draw (`controller=raffles`, `prizeDrawPurchases`) — the next slice in the suite's stated order (raffle (GLI) → **prize draw** → recurring donations).
- `totalsDelta` helper and moving guest creation into `api-setup` — pre-existing ledgered follow-ups from slices 1–2, still not done; this plan does not attempt them (keep scope additive, not a cleanup pass).
