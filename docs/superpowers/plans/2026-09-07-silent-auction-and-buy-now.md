# Silent Auction Bidding, Buy-Now, and Sealed Bidding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the fundraising outcome suite (slice 3) with donor-journey and API coverage for silent-auction bidding (including outbid), Buy It Now lot purchases, and sealed bidding — the three lot types the CMS actually supports, verified live on 2026-09-07.

**Architecture:** Same hybrid pattern as slices 1–2: act through the Lite UI, verify through the EMS API; a standalone API suite covers validation and edge cases the UI path can't reach cheaply. Three permanent fixture lots (one per bid mode) already exist on the E2E event and are kept healthy by `api-setup`, the same way the ticket fixture is.

**Tech Stack:** Playwright ^1.62, TypeScript 7 strict, existing `EmsApi`/`LiteApi`/`LiteBasePage` infrastructure.

**Spec:** `docs/superpowers/specs/2026-09-06-fundraising-outcome-suite-design.md` (§8 originally listed "silent auction" as slice 3, buy-now as a later slice, and excluded live-auction bidding entirely — verified during this slice's brainstorming that CMS Next's lot "Type" has exactly four values (`silent`, `hybrid`, `buy_now`, `sealed`) and no "live" value exists at all, so live-auction bidding is dropped from scope permanently, not deferred).

## Global Constraints

- Test environment only (`https://us.test.givergy.com`); never print credentials; `.env` and `playwright/.auth/` never committed.
- Synthetic donors only, created via `newE2EDonor(seed)` (`qa.e2e.donor+<seed>@givergy.com`); Stripe test card `4242 4242 4242 4242`.
- Never click controls that send tickets/receipts/emails to others, Google Wallet, add-on donation, promo, or recurring controls.
- `npm test` (checklist suite) stays untouched — this slice adds no CMS-page-object changes.
- `lite-e2e` project runs serial (`workers: 1`) — every e2e test in this slice reuses that existing project.
- Every API test is self-cleaning: cancel in `finally`, even on assertion failure.
- **Shared-guest lesson (from slice 2):** `tests/api/*.spec.ts` all run in parallel against the SAME `E2E_API_GUEST_ID`. Never assert on `checkout.grandTotal` or any basket-wide total — scope every money assertion to the entity you just created (its own lot's bid lines, its own purchase's lines), exactly like the ticket suite's fix.
- No new npm dependencies.

## Verified facts this plan is built on

**Three permanent fixture lots already exist** on the E2E event (`5a5bef87-a9e7-11f1-90d8-92b18db85c99`, Lite `robteste2eauto1`), created 2026-09-07 via the CMS's own `CampaignItemsPage.createAuctionItem`, one bid mode each:

| Lot | UUID (`id`) | Display number (Lite URL id) | bidMode | Key fields |
|---|---|---|---|---|
| QA E2E Silent Lot | `d9ac19b6-aa56-11f1-808b-92b18db85c99` | `40706` | `hybrid` | `startPrice: 1000`, `minStartPrice: 2500`, `increments: [{threshold: 0, amount: 2500}]`, `numberAvailable: 1` |
| QA E2E Buy Now Lot | `dcda4f73-aa56-11f1-808b-92b18db85c99` | `46098` | `buy_now` | `buyNowPrice: 5000`, `numberAvailable: 1` |
| QA E2E Sealed Lot | `e055e1e0-aa56-11f1-808b-92b18db85c99` | `51924` | `sealed` | `startPrice: 1000`, `minStartPrice: 2500`, `increments: [{threshold: 0, amount: 2500}]`, `numberAvailable: 1` |

All three: `status: active`, `hidden: false`, `endTime: 2030-12-31T23:00:00.000+00:00`.

**Bid increment rule (silent + sealed lots, verified live):** the first bid on a lot must be at least `minStartPrice` ($25 here); below that, the bid API returns `code: "below_minimum"`. Every following bid must be at least the current top bid plus the increment scheduled for that threshold ($25 here, since `increments: [{threshold: 0, amount: 2500}]`); below that, `code: "below_increase"`. Both are HTTP 200, not errors — the bid is simply rejected in-band. So the outbid sequence on our fixture lots is: first bid `$25` (2500) → accepted; next valid bid `$50` (5000, i.e. `2500 + 2500`) → accepted and becomes the new top.

**Sealed bidding's real, verified effect:** it is a lot `bidMode` (`sealed`), not the `sealedMultiBidding` boolean field (that field is unrelated — do not touch it). With `bidMode: "sealed"` and an active bid present, the check-in bid response itself reports `topAmount: 0` (even to the bidder who just placed it), and the **public** Lite `lots` list (`LiteApi.lots(eventId)`) shows `topBidAmount: 0`, `topBidAmountFormatted: "No Bids Yet"`, `topBidName: "Sealed Bid Item"`, `bidCount: 0` — all fully masked — regardless of how many real bids exist. A silent/hybrid lot with the same bid shows the real amount, bidder name, and count. This is the assertable difference.

**Bid endpoints (check-in, staff/API-side — what the API suite uses):**
- `POST checkin/v1/events/:eventId/guests/:guestId/bids` `{lotId, amount, anonymous, showPopup, liveTAndCAccepted, autoSell}` → bare object `{id, lotId, code: "accepted"|"below_minimum"|"below_increase"|string, message, amount, maxAmount, topAmount, topBid, topBidder}`. Unknown `lotId` → HTTP 404 `{code: "notFound", message: "Lot not found"}`.
- `POST .../bids/cancel` `{id}` → enveloped `{code: "ok", message: "Bid retracted", entity: {...} | null}`. **Idempotent, unlike tickets:** cancelling an already-cancelled or unknown bid id still returns HTTP 200 `"ok"` with `entity: null` — never 404. (Verified live 2026-09-07 — the opposite of `ticketPurchases/cancel`'s 404-on-unknown behaviour; don't assume the two work the same way.)
- Bids **never appear in `payments/checkout`** — `GuestCheckout.bids` stays an empty array even with an active unpaid bid (verified live). Verification for bids must use `EmsApi.reports.bids(eventId)` (rows: `{id, number, item, bids, totalValue, shortId}` — `number` and `shortId` are both the lot's display number, `item` is the lot title) and/or `LiteApi.lots(eventId)` (`topBidAmount`, `topBidName`, `bidCount`), never the checkout basket.

**Buy-now endpoints (verified live):**
- `POST checkin/v1/events/:eventId/guests/:guestId/buyNowPurchases` `{buyNowId, count}` — note the field is `buyNowId`, not `lotId`. Bare object `{id, buyNowId, code: "accepted"|"invalid_bid_mode"|string, message, amount, count, available, bought}`. Unknown `buyNowId` → HTTP 404 `{code: "notFound", message: "Lot not found"}`.
- `POST .../buyNowPurchases/cancel` `{id}` → enveloped `{code: "ok", message: "Buy Now retracted", entity: {...} | null}`. Same idempotent-on-unknown-id behaviour as bids/cancel — HTTP 200, never 404.
- Buy-now purchases **do** appear in `payments/checkout.buyNowPurchases[]`: `{itemId, purchaseId, title, itemNumber, itemAmount, itemCount, totalAmount, baseTotal, subTotal, deliveryOptions, selectedDeliveryOption, ...}` (mirrors `CheckoutTicketPurchase`'s shape).
- A lot cannot have `buyNowPrice > 0` and `numberAvailable > 1` at the same time — the server rejects the write with HTTP 409 `{code: "conflict", message: "you can either have 'Buy Now Price' > 0 or 'No. of Available Items' > 1, not both"}`. Our Buy Now fixture lot is `numberAvailable: 1`.

**Lite UI donor journey (verified live end to end for both a bid and a buy-now purchase):**
- Lot browsing: `?controller=lots&category=All%20Lots` lists lots as links named `Add <title> to Favourites`, each with an `href` of `?controller=lots&action=showLot&id=<displayNumber>` (the short number, e.g. `40706` — **not** the lot's UUID; using the UUID 404s).
- Lot detail (`?controller=lots&action=showLot&id=<displayNumber>`):
  - Silent/sealed lot: a region containing `textbox "Enter Amount"` and `button "Place Bid"`. Silent lots show text `Next Minimum Bid $10`; sealed lots show `Minimum Bid $10` — cosmetic label difference only (the real enforced minimum for both, per the field data above, is `$25`; the UI's minimum-bid label text does not match the API's actual enforced minimum on these fixture lots — a pre-existing UI-copy quirk, not something this plan's tests need to work around beyond not asserting on that label text).
  - Buy-now lot: quantity `button "-"` / `button "+"` (defaulting to `1`), a `textbox` message field, and `button "Purchase"`.
  - Filling `Enter Amount` and clicking `Place Bid` (or clicking `Purchase`) for an anonymous visitor redirects to `?controller=guest&action=checkRegistration&...&redirect=%3Fcontroller%3Dlots%26action%3DconfirmBid%26id%3D<lotUUID>%26amount%3D<cents/100>%26bidMode%3D<mode>...` — same registration flow as donations/tickets (`LiteSignInPage.continueWithEmail` → `LiteRegisterPage` → `OptInsPage.continueWithDefaults`).
  - After registration, lands on `?controller=lots&action=confirmBid&id=<lotUUID>&amount=<dollars>&bidMode=<silent|buy_now>&...`:
    - For a bid: heading text "Please Confirm Your Bid of $<amount>", a `listbox "Select card"` (pre-selected saved card), and buttons `"Anonymous Bid"` / `"Place Bid"`. Clicking `Place Bid` fires `POST lite/v1/events/:eventId/guests/:guestId/bids?tabletMode=false` `{lotId, amount, bidMode, anonymous: "false", hideAmount: "false", giftAidStatus: "not_asked"}` → `{code: "ok", entity: {code: "accepted", id, ...}}`, then navigates to `?controller=lots&action=placeBidSuccess&...` (a bare confirmation page — no further page object needed there; the important content is the network response and the change visible on `myBids&action=winning`).
    - For a buy-now purchase: heading text "Please Confirm Your Purchase of $<amount>", buttons `"Anonymous Buy"` / `"Buy Now"`. Clicking `Buy Now` fires `POST lite/v1/events/:eventId/guests/:guestId/buyNow?tabletMode=false` `{lotId, amount, bidMode: "buy_now", anonymous: "false", hideAmount: "false", giftAidStatus: "not_asked", buyNowCount: "1"}` → `{code: "ok", entity: [{code: "accepted", id, ...}]}`, then navigates to `?controller=guest&action=checkout` — the **existing** `CheckoutPage` (`src/pages/lite/CheckoutPage.ts`) handles payment from here on, unchanged; a bid never reaches a payment step (no money moves until the auction closes, out of scope).
- "My Activity" is reached at `?controller=myBids&action=winning` and has a `tablist` with tabs `"Winning"`, `"Outbid"`, `"Donations"`, `"Favorites"`; each tab's `tabpanel` lists lots the same way the browse page does (`Add <title> to Favourites` links) plus a `Search complete. N result(s) found.` text — use that text or the named link to assert presence/absence.

## File Structure

- `src/api/types.ts` — add `IBidLot`, `IBidLotUpdate`, `LiteLot`, `CheckinBidResult`, `CancelledBid`, `CheckinBuyNowResult`, `CancelledBuyNowPurchase`, `BidsReportRow`, `CheckoutBuyNowPurchase`; extend `GuestCheckout` with `buyNowPurchases: CheckoutBuyNowPurchase[]`.
- `src/api/EmsApi.ts` — add `lots.get/update`, `reports.bids`, `checkin.bid/cancelBid/buyNowPurchase/cancelBuyNowPurchase`.
- `src/api/LiteApi.ts` — add `lots(eventId)`.
- `src/api/lotFixture.ts` (new) — `ensureLotSellable`, the self-healing fixture function (mirrors `ticketFixture.ts`).
- `src/config/env.ts` — extend `env.e2e` with `lotId`, `buyNowLotId`, `sealedLotId`.
- `.env` / `.env.example` — add `E2E_LOT_ID`, `E2E_BUYNOW_LOT_ID`, `E2E_SEALED_LOT_ID`.
- `tests/fixtures.ts` — extend `E2EEvent` with the three new fields.
- `tests/setup/api.setup.ts` — heal all three fixture lots.
- `src/pages/lite/auction/LotsPage.ts` (new) — browse + open a lot by title.
- `src/pages/lite/auction/LotDetailPage.ts` (new) — place a bid or start a purchase.
- `src/pages/lite/auction/BidConfirmPage.ts` (new) — the `confirmBid` screen, both bid and buy-now variants.
- `src/pages/lite/auction/MyActivityPage.ts` (new) — the Winning/Outbid tabs.
- `tests/api/lots.api.spec.ts` (new) — bids, buy-now, sealed-bidding API coverage.
- `tests/e2e/auction.spec.ts` (new) — silent bid + outbid journey, buy-now journey.
- `README.md` — coverage, gotchas, verification counts.

---

### Task 1: API types and clients for lots and bids

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/EmsApi.ts`
- Modify: `src/api/LiteApi.ts`
- Test: `tests/api/lots.api.spec.ts` (created here with one smoke test; Tasks 3–4 append to it)

**Interfaces:**
- Consumes: `HttpClient` (`src/api/http.ts`, unchanged), existing `EmsApi`/`LiteApi` constructor patterns.
- Produces: `IBidLot`, `IBidLotUpdate = Omit<IBidLot, 'created' | 'updated'>`, `LiteLot`, `CheckinBidResult`, `CancelledBid`, `CheckinBuyNowResult`, `CancelledBuyNowPurchase`, `BidsReportRow`, `CheckoutBuyNowPurchase`; `ems.lots.get(eventId, lotId): Promise<IBidLot>`, `ems.lots.update(eventId, lotId, lot: IBidLotUpdate): Promise<unknown>`; `ems.reports.bids(eventId): Promise<BidsReportRow[]>`; `ems.checkin.bid(eventId, guestId, {lotId, amount, anonymous?, autoSell?}): Promise<CheckinBidResult>`; `ems.checkin.cancelBid(eventId, guestId, bidId): Promise<CancelledBid | null>`; `ems.checkin.buyNowPurchase(eventId, guestId, {buyNowId, count}): Promise<CheckinBuyNowResult>`; `ems.checkin.cancelBuyNowPurchase(eventId, guestId, purchaseId): Promise<CancelledBuyNowPurchase | null>`; `lite.lots(eventId): Promise<LiteLot[]>`.

- [ ] **Step 1: Write the failing smoke test**

Create `tests/api/lots.api.spec.ts`:

```ts
import { test, expect } from '../fixtures';

test.describe('EMS iBid API > fixture lots', () => {
  test('all three fixture lots exist with the right bid mode', async ({ ems, e2eEvent }) => {
    const silent = await ems.lots.get(e2eEvent.id, e2eEvent.lotId);
    expect(silent).toMatchObject({ id: e2eEvent.lotId, status: 'active', hidden: false, minStartPrice: 2500 });

    const buyNow = await ems.lots.get(e2eEvent.id, e2eEvent.buyNowLotId);
    expect(buyNow).toMatchObject({ id: e2eEvent.buyNowLotId, status: 'active', hidden: false, bidMode: 'buy_now', buyNowPrice: 5000 });

    const sealed = await ems.lots.get(e2eEvent.id, e2eEvent.sealedLotId);
    expect(sealed).toMatchObject({ id: e2eEvent.sealedLotId, status: 'active', hidden: false, bidMode: 'sealed', minStartPrice: 2500 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=api lots`
Expected: FAIL — `e2eEvent.lotId` etc. don't exist yet (TypeScript compile error surfaced as a test failure), and `ems.lots` is undefined.

- [ ] **Step 3: Add the new types to `src/api/types.ts`**

Append:

```ts
/** GET/POST ems/v1/iBid/events/:eventId/lots/:lotId (enveloped) — the CMS's own lot record. */
export interface IBidLot {
  id: string;
  eventId: string;
  displayNumber: string;
  title: string;
  status: 'active' | string;
  pdaDescription: string;
  webDescription: string;
  pictures: unknown[];
  startTime: string;
  endTime: string;
  created?: string;
  updated?: string;
  sortNumber: number;
  externalId: string;
  donatedItemId: string | null;
  linkedGuestId: string | null;
  hidden: boolean;
  shortId: string;
  portal: boolean;
  strapline: string;
  termsDescription: string;
  paymentDescription: string;
  voucherInfo: string;
  donatedBy: string;
  categories: unknown[];
  silent: boolean;
  buyNowPrice: number; // cents
  marginCap: number;
  bidMode: 'silent' | 'hybrid' | 'buy_now' | 'sealed' | string;
  numberAvailable: number;
  startPrice: number; // cents
  minStartPrice: number; // cents — the enforced minimum for a lot's first bid
  increments: Array<{ threshold: number; amount: number }>; // cents; the minimum jump required over the current top bid
  reserve: number;
  estimate: number;
  displayEstimate: boolean;
  autoSell: boolean;
  featured: boolean;
  allowPayment: boolean;
  featuredPictures: unknown[];
  requirePayment: boolean;
  sealedMultiBidding: boolean; // unrelated to sealed-bid visibility — do not use this to control sealed behaviour
  enableGiftAid: boolean;
  suppliedItemId: string | null;
  supplierCost: number;
  givergySupplyPrice: number;
  clientCost: number;
  deliveryAmount: number;
  deliveryOptions: string[];
  qrPicture: string | null;
  video: string;
  passwordProtect: boolean;
  password: string;
  taxRate: number;
  fmvLocked: boolean;
  revenueStreamType: string;
  cost: number;
  closed: boolean;
}

/** Payload for POST …/lots/:id — the server owns `created`/`updated`. */
export type IBidLotUpdate = Omit<IBidLot, 'created' | 'updated'>;

/** GET lite/v1/events/:eventId/lots (enveloped array) — the public lot listing. */
export interface LiteLot {
  id: string;
  displayNumber: string;
  title: string;
  pictures: unknown[];
  pictureInfos: unknown[];
  categories: unknown[];
  buyNowPrice: number;
  bidMode: 'silent' | 'hybrid' | 'buy_now' | 'sealed' | string;
  numberAvailable: number;
  startPrice: number;
  reserve: number;
  /** Masked to 0 on a sealed lot regardless of real bids. */
  topBidAmount: number;
  /** "No Bids Yet" on a sealed lot even with real bids present. */
  topBidAmountFormatted: string;
  /** "Sealed Bid Item" on a sealed lot even with real bids present; "No Bids" when genuinely empty. */
  topBidName: string;
  topBidId: string;
  anonymous: boolean;
  /** Masked to 0 on a sealed lot regardless of real bid count. */
  bidCount: number;
  silent: boolean;
  boughtTotal: number;
  passwordProtect: boolean;
  status: 'active' | string;
  hidden: boolean;
}

/** POST checkin/v1/events/:eventId/guests/:guestId/bids (BARE payload, HTTP 200 even when rejected) */
export interface CheckinBidResult {
  id: string; // bid id — pass to cancelBid
  lotId: string;
  code: 'accepted' | 'below_minimum' | 'below_increase' | string;
  message: string;
  amount: number;
  maxAmount: number;
  topAmount: number; // masked to 0 on a sealed lot
  topBid: string;
  topBidder: string | null;
}

/** POST .../bids/cancel (enveloped; entity is null when the bid id was already gone — this endpoint is idempotent, unlike ticketPurchases/cancel). */
export interface CancelledBid {
  id: string;
  guestId: string;
  guestName: string;
  anonymous: boolean;
}

/** POST checkin/v1/events/:eventId/guests/:guestId/buyNowPurchases (BARE OBJECT — not an array, unlike ticketPurchases) */
export interface CheckinBuyNowResult {
  id: string; // purchase id — pass to cancelBuyNowPurchase
  buyNowId: string;
  code: 'accepted' | 'invalid_bid_mode' | string;
  message: string;
  amount: number;
  count: number;
  available: number;
  bought: number;
}

/** POST .../buyNowPurchases/cancel (enveloped; entity is null when the purchase id was already gone — idempotent). */
export interface CancelledBuyNowPurchase {
  id: string;
  guestId: string;
  guestName: string;
  anonymous: boolean;
}

/** GET .../reports/bids (enveloped array) — one row per lot, regardless of bid mode. */
export interface BidsReportRow {
  id: string; // lot id
  number: string; // the lot's display number
  item: string; // lot title
  bids: number; // bid count
  totalValue: number; // cents
  shortId: string;
}

/** One line of GuestCheckout.buyNowPurchases (bids never appear in checkout — see EmsApi.checkin.bid's docblock) */
export interface CheckoutBuyNowPurchase {
  itemId: string; // lot id
  purchaseId: string;
  title: string;
  itemNumber: string;
  itemAmount: number;
  itemCount: number;
  totalAmount: number;
  baseTotal: number;
  subTotal: number;
}
```

Then extend the existing `GuestCheckout` interface: change

```ts
export interface GuestCheckout {
  donations: Array<{ itemId: string; purchaseId: string; title: string; totalAmount: number }>;
  bids: unknown[];
  ticketPurchases: CheckoutTicketPurchase[];
```

to

```ts
export interface GuestCheckout {
  donations: Array<{ itemId: string; purchaseId: string; title: string; totalAmount: number }>;
  /** Verified live 2026-09-07: an active, unpaid bid never appears here (silent-auction bids don't charge until the auction closes) — always empty in this suite. Verify bids via EmsApi.reports.bids / LiteApi.lots instead. */
  bids: unknown[];
  ticketPurchases: CheckoutTicketPurchase[];
  buyNowPurchases: CheckoutBuyNowPurchase[];
```

- [ ] **Step 4: Add the new client methods**

In `src/api/types.ts`'s import list inside `EmsApi.ts`, add `BidsReportRow, CancelledBid, CancelledBuyNowPurchase, CheckinBidResult, CheckinBuyNowResult, IBidLot, IBidLotUpdate` to the existing `import { ... } from './types';` block.

In `EmsApi.ts`, extend `readonly reports = { ... }` by adding, alongside the existing `totals`/`donations`/`allDonations`:

```ts
    bids: (eventId: string) => this.http.get<BidsReportRow[]>(`checkin/v1/events/${eventId}/reports/bids`),
```

Add a new top-level member, alongside the existing `readonly tickets = { ... }`:

```ts
  /** The CMS's own lot records (the "iBid" API the CMS Next Auction Items pages save through). */
  readonly lots = {
    get: (eventId: string, lotId: string) => this.http.get<IBidLot>(`v1/iBid/events/${eventId}/lots/${lotId}`),

    /** Full-record update — send the whole lot (as returned by `get`) with the changed fields, minus `created`/`updated`. */
    update: (eventId: string, lotId: string, lot: IBidLotUpdate) =>
      this.http.post<unknown>(`v1/iBid/events/${eventId}/lots/${lotId}`, lot),
  };
```

Extend `readonly checkin = { ... }` by adding, alongside the existing `makeDonation`/`cancelDonation`/`purchaseTickets`/`cancelTicketPurchase`:

```ts
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
```

In `src/api/LiteApi.ts`, add `LiteLot` to the `import { LiteEvent, LiteTicket, PledgeItem } from './types';` line, and add this method to the class, alongside `tickets`:

```ts
  /** All lots currently shown on the public site (any bid mode). */
  lots(eventId: string) {
    return this.http.get<LiteLot[]>(`v1/events/${eventId}/lots`);
  }
```

- [ ] **Step 5: Run the smoke test — still expected to fail**

Run: `npx playwright test --project=api-setup --project=api lots`
Expected: FAIL — `e2eEvent.lotId`/`buyNowLotId`/`sealedLotId` don't exist on the fixture yet (Task 2).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: the only errors are the missing `e2eEvent.lotId` etc. fields from Task 2 — confirm no other type errors.

- [ ] **Step 7: Commit**

```bash
git add src/api/types.ts src/api/EmsApi.ts src/api/LiteApi.ts tests/api/lots.api.spec.ts
git commit -m "feat(api): lot/bid/buy-now types and EMS/Lite clients

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Fixture lots — env wiring and self-healing

**Files:**
- Modify: `.env`, `.env.example`
- Modify: `src/config/env.ts`
- Modify: `tests/fixtures.ts`
- Modify: `tests/setup/api.setup.ts`
- Create: `src/api/lotFixture.ts`
- Test: `tests/api/lots.api.spec.ts` (extends the file from Task 1)

**Interfaces:**
- Consumes: `EmsApi.lots.get/update` (Task 1), `IBidLot`/`IBidLotUpdate` (Task 1).
- Produces: `ensureLotSellable(ems: EmsApi, eventId: string, lotId: string, overrides?: Partial<IBidLotUpdate>): Promise<void>`; `LOT_MIN_DAYS_LEFT`; `env.e2e.lotId` / `env.e2e.buyNowLotId` / `env.e2e.sealedLotId`; `E2EEvent.lotId` / `.buyNowLotId` / `.sealedLotId` (all `string`).

- [ ] **Step 1: Add the fixture ids to `.env` and `.env.example`**

In both files, alongside the existing `E2E_TICKET_ID=...` line, add:

```
E2E_LOT_ID=d9ac19b6-aa56-11f1-808b-92b18db85c99
E2E_BUYNOW_LOT_ID=dcda4f73-aa56-11f1-808b-92b18db85c99
E2E_SEALED_LOT_ID=e055e1e0-aa56-11f1-808b-92b18db85c99
```

(These three lots — "QA E2E Silent Lot", "QA E2E Buy Now Lot", "QA E2E Sealed Lot" — already exist on the E2E event; created once via the CMS the same way the ticket fixture was. Nothing else needs to create them.)

- [ ] **Step 2: Extend `src/config/env.ts`**

Change:

```ts
  e2e: {
    eventId: required('E2E_EVENT_ID'),
    liteUiBaseUrl: required('E2E_LITE_UI_BASE_URL').replace(/\/+$/, ''),
    apiGuestId: required('E2E_API_GUEST_ID'),
    ticketId: required('E2E_TICKET_ID'),
  },
```

to

```ts
  e2e: {
    eventId: required('E2E_EVENT_ID'),
    liteUiBaseUrl: required('E2E_LITE_UI_BASE_URL').replace(/\/+$/, ''),
    apiGuestId: required('E2E_API_GUEST_ID'),
    ticketId: required('E2E_TICKET_ID'),
    lotId: required('E2E_LOT_ID'),
    buyNowLotId: required('E2E_BUYNOW_LOT_ID'),
    sealedLotId: required('E2E_SEALED_LOT_ID'),
  },
```

- [ ] **Step 3: Extend `tests/fixtures.ts`**

Change the `E2EEvent` interface:

```ts
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
}
```

And the `e2eEvent` fixture body:

```ts
  e2eEvent: async ({}, use) => {
    await use({
      id: env.e2e.eventId,
      liteUiBaseUrl: env.e2e.liteUiBaseUrl,
      apiGuestId: env.e2e.apiGuestId,
      ticketId: env.e2e.ticketId,
      lotId: env.e2e.lotId,
      buyNowLotId: env.e2e.buyNowLotId,
      sealedLotId: env.e2e.sealedLotId,
    });
  },
```

- [ ] **Step 4: Create `src/api/lotFixture.ts`**

```ts
import { EmsApi } from './EmsApi';
import type { IBidLotUpdate } from './types';

/** A lot needs at least this many days left on its sale window to be worth using in a run. */
export const LOT_MIN_DAYS_LEFT = 30;
const DAY_MS = 86_400_000;
const FAR_FUTURE_END_TIME = '2030-12-31T23:00:00.000+00:00';

/**
 * Keeps one fixture lot sellable: active, visible, at least one item available,
 * and far from its sale end. Optional `overrides` re-assert bid-mode-specific
 * fields (e.g. `{ bidMode: 'buy_now', buyNowPrice: 5000 }`) in case a previous
 * run's exploration or a manual CMS edit drifted them. Mirrors
 * `ticketFixture.ts`'s `ensureTicketSellable` — same "strip created/updated,
 * send the rest back" write shape (lots have no ticket-style immutable field
 * like `ticketType`, so nothing else needs stripping).
 */
export async function ensureLotSellable(
  ems: EmsApi,
  eventId: string,
  lotId: string,
  overrides: Partial<IBidLotUpdate> = {},
): Promise<void> {
  const lot = await ems.lots.get(eventId, lotId);
  const daysLeft = (Date.parse(lot.endTime) - Date.now()) / DAY_MS;
  const overrideDrifted = (Object.keys(overrides) as Array<keyof IBidLotUpdate>).some((key) => lot[key] !== overrides[key]);

  const needsHealing = lot.status !== 'active' || lot.hidden || lot.numberAvailable < 1 || daysLeft < LOT_MIN_DAYS_LEFT || overrideDrifted;
  if (!needsHealing) return;

  const { created, updated, ...editable } = lot;
  void created;
  void updated;
  await ems.lots.update(eventId, lotId, {
    ...editable,
    status: 'active',
    hidden: false,
    numberAvailable: Math.max(lot.numberAvailable, 1),
    endTime: FAR_FUTURE_END_TIME,
    ...overrides,
  });

  const after = await ems.lots.get(eventId, lotId);
  if (after.status !== 'active' || after.hidden || after.numberAvailable < 1) {
    throw new Error(
      `Lot ${lotId} ("${lot.title}") could not be healed to a sellable state. ` +
        `Check it directly in the CMS: events/${eventId}/lots/edit/?id=${lotId}`,
    );
  }
}
```

- [ ] **Step 5: Wire healing into `tests/setup/api.setup.ts`**

Read the current file first (it already calls `ensureTicketSellable`). Add an import for `ensureLotSellable` from `../../src/api/lotFixture`, and after the existing ticket-healing call, add:

```ts
  await ensureLotSellable(ems, env.e2e.eventId, env.e2e.lotId);
  await ensureLotSellable(ems, env.e2e.eventId, env.e2e.buyNowLotId, { bidMode: 'buy_now', buyNowPrice: 5000 });
  await ensureLotSellable(ems, env.e2e.eventId, env.e2e.sealedLotId, { bidMode: 'sealed' });
```

- [ ] **Step 6: Append a fixture-health test to `tests/api/lots.api.spec.ts`**

Add, in the same file, after the existing smoke test:

```ts
test.describe('EMS iBid API > fixture lot health', () => {
  test('api-setup leaves all three fixture lots sellable', async ({ ems, e2eEvent }) => {
    for (const [id, expectedMode] of [
      [e2eEvent.lotId, undefined],
      [e2eEvent.buyNowLotId, 'buy_now'],
      [e2eEvent.sealedLotId, 'sealed'],
    ] as const) {
      const lot = await ems.lots.get(e2eEvent.id, id);
      expect(lot.status).toBe('active');
      expect(lot.hidden).toBe(false);
      expect(lot.numberAvailable).toBeGreaterThanOrEqual(1);
      if (expectedMode) expect(lot.bidMode).toBe(expectedMode);
    }
  });
});
```

- [ ] **Step 7: Run and verify**

Run: `npx playwright test --project=api-setup --project=api lots`
Expected: typecheck clean; `3 passed` (1 setup + 2 in this file).

- [ ] **Step 8: Commit**

```bash
git add .env.example src/config/env.ts src/api/lotFixture.ts tests/fixtures.ts tests/setup/api.setup.ts tests/api/lots.api.spec.ts
git commit -m "feat(api-setup): keep the three fixture lots sellable via the iBid API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Note: do NOT commit `.env` itself (gitignored) — only `.env.example`. If `.env` is untracked, `git status --short` should show nothing for it either way; if it somehow shows as modified, do not `git add` it.

---

### Task 3: API suite — bids, outbid, and validation

**Files:**
- Modify: `tests/api/lots.api.spec.ts`

**Interfaces:**
- Consumes: `ems.checkin.bid/cancelBid` (Task 1), `ems.reports.bids` (Task 1), `lite.lots` (Task 1), `e2eEvent.lotId` (Task 2).
- Produces: nothing new for later tasks — this is a leaf test file.

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/lots.api.spec.ts`:

```ts
import { ApiError } from '../../src/api/http';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

async function bidTotalFor(lots: import('../../src/api/LiteApi').LiteApi extends never ? never : Awaited<ReturnType<import('../../src/api/LiteApi').LiteApi['lots']>>, lotId: string) {
  const l = lots.find((x) => x.id === lotId);
  return { topBidAmount: l?.topBidAmount ?? 0, bidCount: l?.bidCount ?? 0, topBidName: l?.topBidName };
}

test.describe.serial('EMS check-in API > bids (place / cancel / outbid)', () => {
  test('the minimum first bid is accepted; a below-minimum bid is rejected in-band', async ({ ems, e2eEvent }) => {
    const low = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 500 });
    expect(low.code).toBe('below_minimum');

    const result = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 2500 });
    try {
      expect(result).toMatchObject({ code: 'accepted', lotId: e2eEvent.lotId, amount: 2500, topAmount: 2500 });
      await expect
        .poll(async () => (await bidTotalFor(await ems.reports.bids(e2eEvent.id).then(() => []), e2eEvent.lotId)), { timeout: 1 })
        .toBeDefined(); // placeholder poll removed below — see Step 3 correction
    } finally {
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, result.id);
    }
  });
});
```

**Do not commit the snippet above as-is** — it has a deliberately broken `expect.poll` in it (Step 1 only needs *a* failing test to prove the harness runs; Step 3 replaces it with the real assertions below). Run Step 2 first, then go straight to Step 3's real version.

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test --project=api-setup --project=api lots`
Expected: FAIL — the placeholder poll assertion is nonsensical and will fail or hang; that's fine, it confirms the file compiles and the test executes. Replace it now.

- [ ] **Step 3: Replace with the real, complete test file section**

Replace the whole block you just wrote (from `import { ApiError }` through the end of the `describe.serial` block) with:

```ts
import type { LiteApi } from '../../src/api/LiteApi';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

async function liteLot(lite: LiteApi, eventId: string, lotId: string) {
  const lots = await lite.lots(eventId);
  const lot = lots.find((l) => l.id === lotId);
  if (!lot) throw new Error(`Lot ${lotId} not found in the public lots list for event ${eventId}`);
  return lot;
}

test.describe.serial('EMS check-in API > bids (place / cancel / outbid)', () => {
  test('a below-minimum first bid is rejected in-band; the minimum bid is accepted, then cancelled', async ({ ems, lite, e2eEvent }) => {
    const low = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 500 });
    expect(low.code).toBe('below_minimum');

    const result = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 2500 });
    try {
      expect(result).toMatchObject({ code: 'accepted', lotId: e2eEvent.lotId, amount: 2500, topAmount: 2500 });
      await expect.poll(async () => (await liteLot(lite, e2eEvent.id, e2eEvent.lotId)).topBidAmount, { timeout: 15_000 }).toBe(2500);
      const row = (await ems.reports.bids(e2eEvent.id)).find((r) => r.id === e2eEvent.lotId);
      expect(row).toMatchObject({ bids: 1, totalValue: 2500 });
    } finally {
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, result.id);
    }

    await expect.poll(async () => (await liteLot(lite, e2eEvent.id, e2eEvent.lotId)).bidCount, { timeout: 15_000 }).toBe(0);
  });

  test('a below-increase second bid is rejected; a valid outbid becomes the new top', async ({ ems, lite, e2eEvent }) => {
    const first = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 2500 });
    try {
      const tooLow = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 3500 });
      expect(tooLow.code).toBe('below_increase');

      const outbid = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 5000 });
      try {
        expect(outbid).toMatchObject({ code: 'accepted', topAmount: 5000 });
        await expect.poll(async () => (await liteLot(lite, e2eEvent.id, e2eEvent.lotId)).topBidAmount, { timeout: 15_000 }).toBe(5000);
      } finally {
        await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, outbid.id);
      }
    } finally {
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, first.id);
    }
    await expect.poll(async () => (await liteLot(lite, e2eEvent.id, e2eEvent.lotId)).bidCount, { timeout: 15_000 }).toBe(0);
  });
});

test.describe('EMS check-in API > bids (validation)', () => {
  test('an unknown lot id returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: ZERO_UUID, amount: 2500 })).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });

  test('cancelling an unknown bid id is idempotent (HTTP 200, not 404)', async ({ ems, e2eEvent }) => {
    const cancelled = await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID);
    expect(cancelled).toBeNull();
  });
});
```

Only the `import type { LiteApi } from '../../src/api/LiteApi';` line is needed for this task's helper — do not add an `ApiError` import; every failure assertion in this task uses `.rejects.toMatchObject(...)` directly, never a caught error instance.

- [ ] **Step 4: Run twice**

Run: `npx playwright test --project=api-setup --project=api lots` (twice)
Expected each time: `7 passed` (1 fixture smoke + 1 fixture health + 2 outbid/bid + 2 validation... count check: Task 1 added 1 test, Task 2 added 1 test, this task adds 2 + 2 = 4 tests, total 6 tests in this file + 1 api-setup = `7 passed`).

- [ ] **Step 5: Commit**

```bash
git add tests/api/lots.api.spec.ts
git commit -m "test(api): bid placement, outbid, and validation coverage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: API suite — buy-now purchases and sealed-bidding visibility

**Files:**
- Modify: `tests/api/lots.api.spec.ts`

**Interfaces:**
- Consumes: `ems.checkin.buyNowPurchase/cancelBuyNowPurchase` (Task 1), `ems.guests.checkout` (existing), `lite.lots` (Task 1), `e2eEvent.buyNowLotId` / `.sealedLotId` (Task 2).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/lots.api.spec.ts`:

```ts
import type { GuestCheckout } from '../../src/api/types';

function checkoutBuyNowTotal(checkout: GuestCheckout, lotId: string): number {
  return checkout.buyNowPurchases.filter((p) => p.itemId === lotId).reduce((sum, p) => sum + p.totalAmount, 0);
}

test.describe.serial('EMS check-in API > buy-now purchases', () => {
  test('purchasing puts a $50 line in the guest basket; cancelling removes it', async ({ ems, e2eEvent }) => {
    const before = await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId);
    const beforeTotal = checkoutBuyNowTotal(before, e2eEvent.buyNowLotId);

    const result = await ems.checkin.buyNowPurchase(e2eEvent.id, e2eEvent.apiGuestId, { buyNowId: e2eEvent.buyNowLotId, count: 1 });
    try {
      expect(result).toMatchObject({ code: 'accepted', buyNowId: e2eEvent.buyNowLotId, amount: 5000, count: 1 });
      await expect
        .poll(async () => checkoutBuyNowTotal(await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId), e2eEvent.buyNowLotId), { timeout: 15_000 })
        .toBe(beforeTotal + 5000);
    } finally {
      await ems.checkin.cancelBuyNowPurchase(e2eEvent.id, e2eEvent.apiGuestId, result.id);
    }

    await expect
      .poll(async () => checkoutBuyNowTotal(await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId), e2eEvent.buyNowLotId), { timeout: 15_000 })
      .toBe(beforeTotal);
  });
});

test.describe('EMS check-in API > buy-now purchases (validation)', () => {
  test('an unknown buy-now lot id returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(ems.checkin.buyNowPurchase(e2eEvent.id, e2eEvent.apiGuestId, { buyNowId: ZERO_UUID, count: 1 })).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });

  test('cancelling an unknown buy-now purchase id is idempotent (HTTP 200, not 404)', async ({ ems, e2eEvent }) => {
    const cancelled = await ems.checkin.cancelBuyNowPurchase(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID);
    expect(cancelled).toBeNull();
  });
});

test.describe('EMS check-in API > sealed bidding', () => {
  test('a sealed lot masks the top bid amount, bidder name, and count on the public site; a silent lot does not', async ({ ems, lite, e2eEvent }) => {
    const sealedBid = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.sealedLotId, amount: 2500 });
    const silentBid = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 2500 });
    try {
      expect(sealedBid.code).toBe('accepted');
      expect(silentBid.code).toBe('accepted');
      // The check-in response itself masks a sealed lot's top amount, even to the bidder who just placed it.
      expect(sealedBid.topAmount).toBe(0);
      expect(silentBid.topAmount).toBe(2500);

      await expect
        .poll(async () => (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.sealedLotId)?.bidCount, { timeout: 15_000 })
        .toBe(0);
      const sealedLot = (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.sealedLotId)!;
      expect(sealedLot).toMatchObject({ topBidAmount: 0, topBidAmountFormatted: 'No Bids Yet', topBidName: 'Sealed Bid Item', bidCount: 0 });

      const silentLot = (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)!;
      expect(silentLot.topBidAmount).toBe(2500);
      expect(silentLot.bidCount).toBe(1);

      // The admin-facing report still shows the real value for a sealed lot — sealing only hides it from the public site.
      const sealedRow = (await ems.reports.bids(e2eEvent.id)).find((r) => r.id === e2eEvent.sealedLotId);
      expect(sealedRow).toMatchObject({ bids: 1, totalValue: 2500 });
    } finally {
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, sealedBid.id);
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, silentBid.id);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test --project=api-setup --project=api lots`
Expected: FAIL — `checkout.buyNowPurchases` doesn't type-check yet if Task 1's `GuestCheckout` edit was somehow missed (it shouldn't be, since Task 1 already landed); if Task 1–3 are already merged in, this should mostly pass already except for any typo — run once to sanity-check, fix any typo, then proceed.

- [ ] **Step 3: Run again to confirm green**

Run: `npx playwright test --project=api-setup --project=api lots` (twice)
Expected each time: `12 passed` (7 from Tasks 1–3 + 1 buy-now + 2 buy-now validation + 1 sealed-bidding — the reports/bids assertion inside the sealed test's `finally`-guarded body counts as part of that single test).

Note on the exact count above: recompute it yourself from the actual `test(...)` calls in the file at this point rather than trusting this number blindly — count every `test(` in `lots.api.spec.ts` plus the 1 `api-setup` test, and use that as your true baseline for Task 8's final count. Record what you get in your report.

- [ ] **Step 4: Commit**

```bash
git add tests/api/lots.api.spec.ts
git commit -m "test(api): buy-now purchase and sealed-bidding visibility coverage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Lite page objects — lot browsing, detail, and bid/purchase confirmation

**Files:**
- Create: `src/pages/lite/auction/LotsPage.ts`
- Create: `src/pages/lite/auction/LotDetailPage.ts`
- Create: `src/pages/lite/auction/BidConfirmPage.ts`
- Test: `tests/e2e/auction.spec.ts` (created here with a partial journey; Task 6 extends it)

**Interfaces:**
- Consumes: `LiteBasePage.gotoLite` (existing), `LiteSignInPage.continueWithEmail`, `LiteRegisterPage` (`waitForPage/fillDetails/fillCard/setCoverProcessingFee/submit`), `OptInsPage.continueWithDefaults`, `newE2EDonor`, `STRIPE_TEST_CARD`, `usd(cents)` (all existing), `lite.lots` (Task 1), `e2eEvent.lotId` (Task 2).
- Produces: `LotsPage.goto()`, `.openLot(displayNumber: string)`; `LotDetailPage.placeBid(amountCents: number)`, `.expectMinimumBid(cents: number)`; `BidConfirmPage.confirmBid(): Promise<void>` (returns once the bid response's `code === 'ok'` and nested `entity.code === 'accepted'`), `.expectConfirmingAmount(cents: number)`. (Task 6 adds `MyActivityPage`; Task 7 adds `LotDetailPage.startPurchase(quantity)` and `BidConfirmPage.confirmPurchase()`.)

- [ ] **Step 1: Write the failing (partial) journey test**

Create `tests/e2e/auction.spec.ts`:

```ts
import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { LotsPage } from '../../src/pages/lite/auction/LotsPage';
import { LotDetailPage } from '../../src/pages/lite/auction/LotDetailPage';
import { BidConfirmPage } from '../../src/pages/lite/auction/BidConfirmPage';

// Serial within the file; `npm run test:e2e` runs lite-e2e with --workers=1.
test.describe.serial('Lite UI > Silent auction (donor journey, verified via the EMS API)', () => {
  test('a new donor bids the minimum $25 on the silent lot and reaches the confirm-bid step', async ({
    page,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();

    const lots = new LotsPage(page);
    await lots.goto();
    await lots.openLot(e2eEvent.lotId, 'QA E2E Silent Lot');

    const detail = new LotDetailPage(page);
    await detail.placeBid(2500);

    await new LiteSignInPage(page).continueWithEmail(donor.email);
    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    expect(guestId).toMatch(/^[0-9a-f-]{36}$/);
    await new OptInsPage(page).continueWithDefaults();

    const confirm = new BidConfirmPage(page);
    await confirm.expectConfirmingAmount(2500);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 auction`
Expected: FAIL — `Cannot find module '../../src/pages/lite/auction/LotsPage'`.

- [ ] **Step 3: Create `src/pages/lite/auction/LotsPage.ts`**

The lot browse page links each lot's title to `?controller=lots&action=showLot&id=<displayNumber>` — the **short display number**, not the lot's UUID. Since `openLot` is called with the lot's UUID (what the rest of the suite already has, e.g. `e2eEvent.lotId`), it navigates straight to the detail page by title instead of parsing the link's id out of the listing (simpler and avoids an extra round trip):

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';

/** `?controller=lots&category=All%20Lots` — the silent-auction browse page. */
export class LotsPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Silent Auction', exact: true });

  async goto(): Promise<void> {
    await this.gotoLite('lots', undefined, { category: 'All Lots' });
    await this.heading.waitFor();
  }

  /**
   * Opens a lot's detail page directly by title, confirming it is actually
   * listed first. `lotUuid` isn't used in the navigation itself — the site's
   * own links use the lot's short display number, not its UUID — but is kept
   * as a parameter so callers don't need a second lookup just to log which
   * lot they meant.
   */
  async openLot(lotUuid: string, title: string): Promise<void> {
    const link = this.page.getByRole('link', { name: `Add ${title} to Favourites` });
    await expect(link).toBeVisible();
    await link.click();
    await this.page.waitForURL(/action=showLot/, { timeout: 15_000 });
    void lotUuid;
  }
}
```

- [ ] **Step 4: Create `src/pages/lite/auction/LotDetailPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';
import { usd } from '../../../utils/money';

/**
 * `?controller=lots&action=showLot&id=<displayNumber>` — a single lot's page.
 * Silent/sealed lots show a "Place Bid" form; Buy It Now lots show quantity
 * controls and a "Purchase" button instead (see Task 7 for `startPurchase`).
 */
export class LotDetailPage extends LiteBasePage {
  private readonly amountBox = this.page.getByRole('textbox', { name: 'Enter Amount' });
  private readonly placeBidButton = this.page.getByRole('button', { name: 'Place Bid', exact: true });

  /** Fills the bid amount and submits — for an anonymous visitor this redirects to sign-in. */
  async placeBid(amountCents: number): Promise<void> {
    await this.amountBox.waitFor({ state: 'visible', timeout: 15_000 });
    await this.amountBox.fill(String(amountCents / 100));
    await this.placeBidButton.click();
  }

  /** e.g. "Next Minimum Bid $10" (silent) or "Minimum Bid $10" (sealed) — cosmetic label only; the true enforced minimum is the lot's own `minStartPrice`, not this text. */
  async expectMinimumBidLabelVisible(): Promise<void> {
    await expect(this.page.locator('main')).toContainText(/Minimum Bid \$\d/);
  }
}
```

- [ ] **Step 5: Create `src/pages/lite/auction/BidConfirmPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';
import { usd } from '../../../utils/money';

/**
 * `?controller=lots&action=confirmBid&id=<lotUuid>&amount=<dollars>&bidMode=<mode>...` —
 * reached after registration, for both a bid ("Please Confirm Your Bid of $N",
 * buttons "Anonymous Bid"/"Place Bid") and a buy-now purchase ("Please Confirm
 * Your Purchase of $N", buttons "Anonymous Buy"/"Buy Now"). Confirming a bid
 * ends here (no payment step — nothing is charged until the auction closes);
 * confirming a purchase navigates on to `?controller=guest&action=checkout`,
 * handled by the existing `CheckoutPage` (see Task 7).
 */
export class BidConfirmPage extends LiteBasePage {
  private readonly placeBidButton = this.page.getByRole('button', { name: 'Place Bid', exact: true });

  async expectConfirmingAmount(amountCents: number): Promise<void> {
    await expect(this.page.locator('main')).toContainText(`Please Confirm Your Bid of $${usd(amountCents)}`, { timeout: 15_000 });
  }

  /**
   * Clicks "Place Bid" and waits for the site's own bid POST to report success.
   * Never reaches a payment step.
   */
  async confirmBid(): Promise<void> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/bids(\?|$)/.test(r.url()),
        { timeout: 30_000 },
      ),
      this.placeBidButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: { code: string; message: string } | null };
    if (body.code !== 'ok' || body.entity?.code !== 'accepted') {
      throw new Error(`Placing the bid failed: ${body.code}/${body.entity?.code} — ${body.entity?.message ?? body.message}`);
    }
  }
}
```

- [ ] **Step 6: Run the partial journey**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 auction`
Expected: `2 passed` (~40–60 s). It leaves an unconfirmed bid intent on the confirm page — the site hasn't sent the bid POST yet at this point (only clicking "Place Bid" on the *confirm* page does that, which this partial test doesn't reach), so nothing needs cleaning up.

- [ ] **Step 7: Commit**

```bash
git add src/pages/lite/auction/LotsPage.ts src/pages/lite/auction/LotDetailPage.ts src/pages/lite/auction/BidConfirmPage.ts tests/e2e/auction.spec.ts
git commit -m "feat(lite): auction lot browsing, detail, and bid-confirm page objects; partial bid journey

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Complete bid journey, My Activity, and the outbid case

**Files:**
- Create: `src/pages/lite/auction/MyActivityPage.ts`
- Modify: `tests/e2e/auction.spec.ts`

**Interfaces:**
- Consumes: Task 5's page objects, `BidConfirmPage.confirmBid()` (Task 5), `ems.checkin.bid/cancelBid` (Task 1), `ems.reports.bids` (Task 1), `lite.lots` (Task 1).
- Produces: `MyActivityPage.gotoWinning()`, `.gotoOutbid()`, `.expectListed(title: string)`, `.expectNotListed(title: string)`.

- [ ] **Step 1: Extend the test into the full bid + outbid journey**

Replace the test body's tail (everything after `await confirm.expectConfirmingAmount(2500);`) and add the new imports/describe block, so `tests/e2e/auction.spec.ts`'s first `describe.serial` block becomes:

```ts
import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { LotsPage } from '../../src/pages/lite/auction/LotsPage';
import { LotDetailPage } from '../../src/pages/lite/auction/LotDetailPage';
import { BidConfirmPage } from '../../src/pages/lite/auction/BidConfirmPage';
import { MyActivityPage } from '../../src/pages/lite/auction/MyActivityPage';

test.describe.serial('Lite UI > Silent auction (donor journey, verified via the EMS API)', () => {
  test('a new donor bids the minimum $25 on the silent lot and it shows as Winning', async ({
    page,
    ems,
    lite,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();

    const lots = new LotsPage(page);
    await lots.goto();
    await lots.openLot(e2eEvent.lotId, 'QA E2E Silent Lot');

    const detail = new LotDetailPage(page);
    await detail.placeBid(2500);

    await new LiteSignInPage(page).continueWithEmail(donor.email);
    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    await new OptInsPage(page).continueWithDefaults();

    const confirm = new BidConfirmPage(page);
    await confirm.expectConfirmingAmount(2500);
    try {
      await confirm.confirmBid();

      const myActivity = new MyActivityPage(page);
      await myActivity.gotoWinning();
      await myActivity.expectListed('QA E2E Silent Lot');

      await expect
        .poll(async () => (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)?.topBidAmount, { timeout: 15_000 })
        .toBe(2500);
      const row = (await ems.reports.bids(e2eEvent.id)).find((r) => r.id === e2eEvent.lotId);
      expect(row).toMatchObject({ bids: 1, totalValue: 2500 });
    } finally {
      const lot = (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId);
      if (lot && lot.topBidId) {
        await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, lot.topBidId).catch(() => {});
      }
    }
    await expect.poll(async () => (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)?.bidCount, { timeout: 15_000 }).toBe(0);
  });
});

test.describe.serial('Lite UI > Silent auction (outbid, verified via the EMS API)', () => {
  test('the API guest bids first; a new UI donor outbids them and becomes the new top bidder', async ({
    page,
    ems,
    lite,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();
    const firstBid = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 2500 });
    expect(firstBid.code).toBe('accepted');

    try {
      const lots = new LotsPage(page);
      await lots.goto();
      await lots.openLot(e2eEvent.lotId, 'QA E2E Silent Lot');

      const detail = new LotDetailPage(page);
      await detail.placeBid(5000); // firstBid.topAmount (2500) + the $25 increment

      await new LiteSignInPage(page).continueWithEmail(donor.email);
      const register = new LiteRegisterPage(page);
      await register.waitForPage();
      await register.fillDetails(donor);
      await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
      await register.setCoverProcessingFee(false);
      await register.submit();
      await new OptInsPage(page).continueWithDefaults();

      const confirm = new BidConfirmPage(page);
      await confirm.expectConfirmingAmount(5000);
      await confirm.confirmBid();

      await expect
        .poll(async () => (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)?.topBidAmount, { timeout: 15_000 })
        .toBe(5000);
      const outbidLot = (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)!;
      expect(outbidLot.topBidName).toContain(donor.firstName);
      const row = (await ems.reports.bids(e2eEvent.id)).find((r) => r.id === e2eEvent.lotId);
      expect(row).toMatchObject({ bids: 2, totalValue: 5000 });

      const uiDonorBidId = outbidLot.topBidId;
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, uiDonorBidId).catch(() => {});
    } finally {
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, firstBid.id).catch(() => {});
    }
    await expect.poll(async () => (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)?.bidCount, { timeout: 15_000 }).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 auction`
Expected: FAIL — `Cannot find module '../../src/pages/lite/auction/MyActivityPage'`.

- [ ] **Step 3: Create `src/pages/lite/auction/MyActivityPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';

/** `?controller=myBids&action=winning` — "My Activity", tabs Winning / Outbid / Donations / Favorites. */
export class MyActivityPage extends LiteBasePage {
  async gotoWinning(): Promise<void> {
    await this.gotoLite('myBids', 'winning');
    await this.page.getByRole('tab', { name: 'Winning', exact: true }).waitFor();
  }

  async gotoOutbid(): Promise<void> {
    await this.gotoLite('myBids', 'winning');
    await this.page.getByRole('tab', { name: 'Winning', exact: true }).waitFor();
    await this.page.getByRole('tab', { name: 'Outbid', exact: true }).click();
  }

  async expectListed(title: string): Promise<void> {
    await expect(this.page.getByRole('link', { name: `Add ${title} to Favourites` })).toBeVisible({ timeout: 15_000 });
  }

  async expectNotListed(title: string): Promise<void> {
    await expect(this.page.getByRole('link', { name: `Add ${title} to Favourites` })).toHaveCount(0);
  }
}
```

- [ ] **Step 4: Run the full bid + outbid journey twice**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 auction` (twice)
Expected each time: `3 passed` (1 setup + 2 auction tests), each run ~90–150 s (two full registrations). Both leave the silent lot clean (asserted `bidCount === 0` at the end of each test).

- [ ] **Step 5: Commit**

```bash
git add src/pages/lite/auction/MyActivityPage.ts tests/e2e/auction.spec.ts
git commit -m "feat(lite): My Activity page object; complete bid + outbid journeys verified via EMS API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Buy-now journey

**Files:**
- Modify: `src/pages/lite/auction/LotDetailPage.ts` (add purchase controls)
- Modify: `src/pages/lite/auction/BidConfirmPage.ts` (add the purchase-confirm variant)
- Modify: `tests/e2e/auction.spec.ts`

**Interfaces:**
- Consumes: Task 5/6 page objects, the existing `CheckoutPage` (`src/pages/lite/CheckoutPage.ts`, unchanged — `waitForPage/setCoverProcessingFee/expectTotalPayment/payWithSavedCard`), `ems.guests.checkout/paymentTransactions` (existing), `usdWhole` (existing).
- Produces: `LotDetailPage.startPurchase(quantity?: number): Promise<void>`; `BidConfirmPage.expectConfirmingPurchaseAmount(cents: number)`, `.confirmPurchase(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to `tests/e2e/auction.spec.ts`:

```ts
import { CheckoutPage } from '../../src/pages/lite/CheckoutPage';

test.describe.serial('Lite UI > Buy It Now (donor journey, verified via the EMS API)', () => {
  test('a new donor buys the $50 Buy Now lot with a test card, and the EMS API records the paid purchase', async ({
    page,
    ems,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();
    const before = await ems.reports.totals(e2eEvent.id);

    const lots = new LotsPage(page);
    await lots.goto();
    await lots.openLot(e2eEvent.buyNowLotId, 'QA E2E Buy Now Lot');

    const detail = new LotDetailPage(page);
    await detail.startPurchase();

    await new LiteSignInPage(page).continueWithEmail(donor.email);
    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    await new OptInsPage(page).continueWithDefaults();

    const confirm = new BidConfirmPage(page);
    await confirm.expectConfirmingPurchaseAmount(5000);
    await confirm.confirmPurchase();

    const checkout = new CheckoutPage(page);
    await checkout.waitForPage();
    await checkout.setCoverProcessingFee(false);
    await checkout.expectTotalPayment(5000);
    await checkout.payWithSavedCard();

    await expect
      .poll(
        async () => (await ems.guests.paymentTransactions(e2eEvent.id, guestId)).filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
        { timeout: 15_000 },
      )
      .toBe(5000);
    const [payment] = await ems.guests.paymentTransactions(e2eEvent.id, guestId);
    expect(payment).toMatchObject({ status: 'paid', processor: 'stripe', amount: 5000, cardLast4: '4242', currency: 'USD' });

    const outstanding = await ems.guests.checkout(e2eEvent.id, guestId);
    expect(outstanding.buyNowPurchases).toEqual([]);
    expect(outstanding.grandTotal).toBe(0);

    // Buy-now purchases are part of fundraising totals, unlike tickets — pin that.
    const after = await ems.reports.totals(e2eEvent.id);
    expect(after.buyItNow.raised - before.buyItNow.raised).toBe(5000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 auction`
Expected: FAIL — `detail.startPurchase is not a function`.

- [ ] **Step 3: Add purchase controls to `LotDetailPage.ts`**

Append inside the class:

```ts
  private readonly purchaseButton = this.page.getByRole('button', { name: 'Purchase', exact: true });
  private readonly increaseQuantityButton = this.page.getByRole('button', { name: /^Increased? the quantity/ });

  /** Buy It Now lots default to quantity 1; only click "+" for a larger `quantity`. */
  async startPurchase(quantity = 1): Promise<void> {
    await this.purchaseButton.waitFor({ state: 'visible', timeout: 15_000 });
    for (let i = 1; i < quantity; i++) {
      await this.increaseQuantityButton.click();
    }
    await this.purchaseButton.click();
  }
```

- [ ] **Step 4: Add the purchase-confirm variant to `BidConfirmPage.ts`**

Append inside the class:

```ts
  private readonly buyNowButton = this.page.getByRole('button', { name: 'Buy Now', exact: true });

  async expectConfirmingPurchaseAmount(amountCents: number): Promise<void> {
    await expect(this.page.locator('main')).toContainText(`Please Confirm Your Purchase of $${usd(amountCents)}`, { timeout: 15_000 });
  }

  /**
   * Clicks "Buy Now" and waits for the site's own buyNow POST to report
   * success. Unlike a bid, this navigates on to the standard checkout page
   * (`?controller=guest&action=checkout`) for payment.
   */
  async confirmPurchase(): Promise<void> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/buyNow(\?|$)/.test(r.url()),
        { timeout: 30_000 },
      ),
      this.buyNowButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: Array<{ code: string; message: string }> | null };
    const first = body.entity?.[0];
    if (body.code !== 'ok' || first?.code !== 'accepted') {
      throw new Error(`Confirming the purchase failed: ${body.code}/${first?.code} — ${first?.message ?? body.message}`);
    }
  }
```

- [ ] **Step 5: Run the full buy-now journey twice**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 auction` (twice)
Expected each time: `4 passed` (1 setup + bid + outbid + buy-now), ~150–220 s total. Each run buys one real $50 test-mode lot with a fresh donor.

- [ ] **Step 6: Commit**

```bash
git add src/pages/lite/auction/LotDetailPage.ts src/pages/lite/auction/BidConfirmPage.ts tests/e2e/auction.spec.ts
git commit -m "feat(lite): buy-now purchase controls and confirmation; complete journey verified via EMS API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Docs and full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document coverage, fixtures, and gotchas**

Under "## Current coverage", after the tickets bullets, add:

```markdown
- **Silent auction — bid and outbid (Lite UI + EMS API)** (`tests/e2e/auction.spec.ts`):
  a new donor bids the $25 minimum on the fixture lot, registers with a Stripe
  test card, and the bid shows under My Activity's "Winning" tab; a second
  journey has the shared API guest bid first, then a new UI donor outbid them
  at the required $25 increment and become the new top bidder — both verified
  via the EMS bids report and the public Lite lots listing.
- **Buy It Now (Lite UI + EMS API)** (`tests/e2e/auction.spec.ts`): a new donor
  buys the $50 fixture lot outright, pays with a test card through the
  existing checkout flow, and the EMS API shows a paid purchase, an empty
  basket, and the amount counted in `reports/totals.buyItNow` (unlike tickets,
  buy-now purchases DO count toward fundraising totals).
- **Auction API** (`tests/api/lots.api.spec.ts`): bid placement respects the
  lot's minimum and increment rules (`below_minimum` / `below_increase` /
  `accepted`), cancel is idempotent (HTTP 200 even for an unknown id, unlike
  ticket cancellation), buy-now purchase/cancel, and sealed bidding masks the
  top amount, bidder name, and count on the public site (verified against a
  non-sealed lot with an identical bid, which shows the real values).
- **Auction fixtures** — three permanent lots (`E2E_LOT_ID`, `E2E_BUYNOW_LOT_ID`,
  `E2E_SEALED_LOT_ID`), one per bid mode; `api-setup` keeps them active,
  visible, and far from their sale end via the iBid API.
```

Under "#### Lite UI (public site) gotchas — from building the donation journey", append:

```markdown
- **A lot's detail-page URL uses its short display number, not its UUID** —
  `?controller=lots&action=showLot&id=40706`, never the lot's `id` field from
  the API. Only the browse page's own links carry the right number; page
  objects open a lot by clicking its "Add … to Favourites" link rather than
  building the URL from an id the suite already has.
- **A lot's minimum-bid label text doesn't necessarily match its enforced
  minimum** — our fixture lots show "Minimum Bid $10" / "Next Minimum Bid $10"
  in the UI, but the API rejects anything below the lot's real
  `minStartPrice` ($25) with `code: "below_minimum"`. Don't assert on the
  label text as if it were the enforced value.
- **A bid never reaches a payment step; a Buy It Now purchase does** — placing
  a bid ends at the confirm-bid page (nothing is charged until the auction
  closes, out of this suite's scope); confirming a Buy It Now purchase
  navigates on to the ordinary `?controller=guest&action=checkout` page, the
  same one tickets and donations use.
- **`sealedMultiBidding` is not what makes a lot sealed** — that boolean field
  is unrelated. The real control is the lot's `bidMode` (`silent` / `hybrid` /
  `buy_now` / `sealed`), set by picking a "Type" in the CMS lot editor
  (options: Silent Auction, Silent + Max Bidding, Buy It Now, Sealed Bidding).
  There is no "Live" type — live-auction bidding isn't a feature this CMS
  exposes for silent-auction-based events at all (verified by reading the
  real save payload the CMS sends when changing this field: the enum has
  exactly those four values).
- **Bid/buy-now cancellation is idempotent; ticket cancellation is not** —
  `bids/cancel` and `buyNowPurchases/cancel` both return HTTP 200 even for an
  already-cancelled or unknown id, unlike `ticketPurchases/cancel`, which
  404s on an unknown id (and separately, sc-98155, 500s on cancelling a real
  one). Don't assume every `.../cancel` endpoint in this API behaves the same
  way — check each one.
```

Under "### Known limitations / follow-up work", append:

```markdown
- **Live auction bidding is out of scope permanently, not deferred** — it
  isn't a lot type this CMS supports at all (see the gotcha above), so there
  is nothing to test regardless of tooling or manual steps.
- **Closing the campaign, selling a lot, and the losing-bidder payment flow
  are out of scope** — the "Close Campaign" wizard's later steps charge cards
  and send emails for real, and both fundraising-suite events are reused on
  every run, so there is no disposable copy to safely close.
```

- [ ] **Step 2: Full fundraising verification**

Run: `npm run typecheck && npm run test:fundraising`
Expected: `test:api` passes with the count you recorded at the end of Task 4 plus this task adds none — recompute and record the true total (1 setup + 3 reports + 3 lite-public + 6 tickets + N lots, where N is whatever Task 4's step 3 measured); `test:e2e` → `6 passed` (1 setup + donation + tickets + bid + outbid + buy-now). Then `npx playwright test --project=setup --project=cms-auth --list | tail -1` still lists the checklist projects (no need to run the 38 — this slice touches no CMS code).

- [ ] **Step 3: Commit**

```bash
git add README.md
git status --short   # only README.md
git commit -m "docs: silent auction, buy-now, and sealed-bidding slice — coverage, fixtures, gotchas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage (§8 slice 3, as corrected in chat on 2026-09-07):** "fixture lots via iBid lots" → Task 2 (three lots, one per bid mode actually created via the CMS page object, matching how tickets were fixtured — the spec's "via iBid API" wording for lot *creation* wasn't borne out; only the *healing* is pure iBid API, exactly like tickets). "place bid journey; outbid" → Tasks 5–6. "buy now" (originally a separate later slice, pulled forward into this one per the user's direction) → Task 7. "sealed bidding" (added per the user's direction) → Task 4 (API) plus the shared fixture in Task 2. "Live auction bidding" (originally excluded, then asked about, then confirmed not to exist as a feature) → explicitly dropped, documented in Task 8.
- **Placeholders:** none — Task 3's Step 1 intentionally contains one throwaway broken assertion whose only job is to prove the test file compiles and runs before Step 3 replaces it with the real, complete version; this is flagged inline in the task itself so an implementer doesn't mistake it for the final code.
- **Type/name consistency:** `IBidLot`/`IBidLotUpdate` (Task 1) ↔ `ensureLotSellable` (Task 2); `env.e2e.lotId/buyNowLotId/sealedLotId` ↔ `E2EEvent.lotId/buyNowLotId/sealedLotId` (Task 2) ↔ used in Tasks 3–7; `CheckinBidResult`/`CancelledBid`/`CheckinBuyNowResult`/`CancelledBuyNowPurchase`/`BidsReportRow`/`CheckoutBuyNowPurchase` (Task 1) ↔ consumed in Tasks 3–4; `ems.checkin.bid/cancelBid/buyNowPurchase/cancelBuyNowPurchase`, `ems.lots.get/update`, `ems.reports.bids`, `lite.lots` (Task 1) ↔ every later task; `LotsPage.openLot`, `LotDetailPage.placeBid/startPurchase`, `BidConfirmPage.confirmBid/confirmPurchase/expectConfirmingAmount/expectConfirmingPurchaseAmount`, `MyActivityPage.gotoWinning/gotoOutbid/expectListed` (Tasks 5–7) — every call site in `auction.spec.ts` uses exactly these names.
- **Pre-flight conflict scan (informal, done inline rather than as a separate table since this plan has one clear consumer chain per task rather than multiple parallel implementers overlapping the same file — see the execution skill's own pre-flight step for the formal version at kickoff time):** Tasks 3 and 4 both append to the same `tests/api/lots.api.spec.ts` and must run in that order (4 depends on 3's `ZERO_UUID` constant already existing in the file); Tasks 5–7 all append to the same `tests/e2e/auction.spec.ts` and must run in that order for the same reason (each extends the previous task's import list and describe blocks). Both files are single-writer per task within this plan, so there's no cross-task same-file conflict beyond ordering, which the task numbering already enforces.
