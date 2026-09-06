# Tickets E2E + API (Fundraising Suite, Slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A donor buys one $20 ticket on the public Lite UI and pays with a Stripe test card; the EMS API records a paid `ticket_purchase` — plus a check-in API suite for ticket purchases and a self-healing ticket fixture.

**Architecture:** Extends slice 1's layers without restructuring them: `EmsApi` gains iBid ticket read/update and check-in ticket purchase/cancel; `LiteApi` gains `tickets()`; `api-setup` gains an idempotent "ensure the fixture ticket is sellable" step; four new Lite page objects under `src/pages/lite/tickets/` drive the tickets page, the 4-step booking wizard, the order confirmation, and "My Tickets"; one new e2e spec and one new API spec follow the slice-1 templates (delta-based, self-cleaning, one worker for e2e).

**Tech Stack:** Playwright `^1.62` (`@playwright/test`), TypeScript 7 strict, `dotenv`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-06-fundraising-outcome-suite-design.md` (§4 architecture, §5 test design, §8 slice 2). Slice-2 design approved in chat on 2026-09-06; every locator/endpoint below was verified live that day (memory: `lite_ui_tickets_notes.md`).

## Global Constraints

- `npm test` (checklist suite) stays untouched and green (38). Slice-1 fundraising tests stay green: `test:api` 11 → grows, `test:e2e` 2 → grows.
- No new npm dependencies. Money in **cents**. Fixture ticket price is `2000` ($20.00). With BOTH Step-4 fee toggles off the total is exactly `$20.00`; with them on it is `$24.95` ($4.00 booking fee + $0.95 processing) — always turn both off.
- Only the E2E event `5a5bef87-a9e7-11f1-90d8-92b18db85c99` / `https://us.test.givergy.com/robteste2eauto1`. Fixture ticket id `20bb7708-aa09-11f1-90d8-92b18db85c99` ("QA E2E Ticket") becomes `E2E_TICKET_ID`.
- Donor identities from `newE2EDonor()` only (givergy.com `+seed` emails, `xxx-555-xxxx` mobiles). Stripe test card `4242…`.
- **Never** click "Send All Tickets", "Send Tickets To Guest(s)/Yourself", "Add Ticket Manager", "Add My Ticket to Google Wallet", or any add-on donation button. Assignment is skipped via the **"Add later"** link. Buying a ticket emails an order confirmation to the synthetic donor — accepted, same as slice 1.
- **Unpaid ticket reservations expire in ~10–15 minutes and the booking wizard resets to Step 1 on any page reload** — the journey never reloads mid-wizard and pays promptly. `test.setTimeout(240_000)`.
- Tickets are **not** included in `reports/totals` (no tickets bucket) — the journey asserts `totalRaised` is unchanged. Verification oracle is `guests/:g/payments/transactions` (`recordType: "ticket_purchase"`), `guests/:g/payments/checkout`, Lite "My Tickets".
- Check-in `POST …/ticketPurchases` returns a BARE array with HTTP 200 even on failure (`code: "soldOut"`); `POST …/ticketPurchases/cancel` returns **HTTP 500 but does cancel** — known bug **sc-98155**; the API suite encodes both facts.
- API tests that change guest state run in one `test.describe.serial` and clean up in `finally`; `test:fundraising` keeps running `api` before `lite-e2e`.
- Nothing secret committed (`.env`, `playwright/.auth/` gitignored). Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `.env.example`, `.env` (local) (modify) | `E2E_TICKET_ID` |
| `src/config/env.ts` (modify) | `env.e2e.ticketId` |
| `src/api/types.ts` (modify) | `LiteTicket`, `IBidTicket`, `CheckinTicketPurchaseResult`, `CheckoutTicketPurchase`; type `GuestCheckout.ticketPurchases` |
| `src/api/LiteApi.ts` (modify) | `tickets(eventId)` |
| `src/api/EmsApi.ts` (modify) | `tickets.get/update` (iBid), `checkin.purchaseTickets`, `checkin.cancelTicketPurchase` |
| `src/api/ticketFixture.ts` (create) | `ensureTicketSellable(ems, eventId, ticketId)` |
| `tests/setup/api.setup.ts` (modify) | call `ensureTicketSellable` after login |
| `tests/fixtures.ts` (modify) | `e2eEvent.ticketId` |
| `tests/api/lite-public.api.spec.ts` (modify) | fixture ticket is sellable |
| `tests/api/tickets.api.spec.ts` (create) | check-in ticket purchase/cancel/validation |
| `src/pages/lite/tickets/TicketsPage.ts` (create) | `?controller=tickets`: quantity +/−, Buy Tickets |
| `src/pages/lite/tickets/TicketBookingPage.ts` (create) | the 4-step wizard through payment |
| `src/pages/lite/tickets/TicketConfirmationPage.ts` (create) | "Thank you for your order!" |
| `src/pages/lite/tickets/MyTicketsPage.ts` (create) | `myBids&action=tickets` |
| `tests/e2e/tickets.spec.ts` (create) | the ticket journey verified via EMS API |
| `README.md` (modify) | coverage, fixture, gotchas, bug sc-98155 |

---

### Task 1: Ticket config, types, and API client methods

**Files:**
- Modify: `.env.example`, `.env` (local only), `src/config/env.ts`, `src/api/types.ts`, `src/api/LiteApi.ts`, `src/api/EmsApi.ts`
- Test: `tests/api/lite-public.api.spec.ts`

**Interfaces:**
- Consumes: `HttpClient` (`get<T>/post<T>`), `env.e2e.eventId`, existing `EmsApi`/`LiteApi` classes and the `lite`/`e2eEvent` fixtures.
- Produces: `env.e2e.ticketId: string`; types `LiteTicket`, `IBidTicket`, `CheckinTicketPurchaseResult`, `CheckoutTicketPurchase`; `LiteApi.tickets(eventId): Promise<LiteTicket[]>`; `EmsApi.tickets.get(eventId, ticketId): Promise<IBidTicket>`; `EmsApi.tickets.update(eventId, ticketId, ticket: IBidTicket): Promise<unknown>`; `EmsApi.checkin.purchaseTickets(eventId, guestId, { ticketId, count }): Promise<CheckinTicketPurchaseResult[]>`; `EmsApi.checkin.cancelTicketPurchase(eventId, guestId, purchaseId): Promise<unknown>`; `GuestCheckout.ticketPurchases: CheckoutTicketPurchase[]`.

- [ ] **Step 1: Add the variable**

Append to `.env.example` (inside the fundraising block) and add the same line to the local `.env`:

```
# The pre-created "QA E2E Ticket" ($20) on the E2E event; api-setup keeps it sellable (stock, sale end).
E2E_TICKET_ID=20bb7708-aa09-11f1-90d8-92b18db85c99
```

In `src/config/env.ts`, inside `e2e: { … }`, add after `apiGuestId`:

```ts
    ticketId: required('E2E_TICKET_ID'),
```

- [ ] **Step 2: Write the failing test**

Append to `tests/api/lite-public.api.spec.ts` inside the existing `test.describe('Lite public API > E2E event', …)`:

```ts
  test('the fixture ticket is on sale: active, $20, in stock, sale end in the future', async ({ lite, e2eEvent }) => {
    const tickets = await lite.tickets(e2eEvent.id);
    const ticket = tickets.find((t) => t.id === e2eEvent.ticketId);
    expect(ticket, `ticket ${e2eEvent.ticketId} not listed on the public site`).toBeDefined();
    expect(ticket).toMatchObject({ status: 'active', hidden: false, price: 2000, type: 'individual' });
    expect(ticket!.numberAvailable).toBeGreaterThanOrEqual(1);
    expect(ticket!.maxPerOrder).toBeGreaterThanOrEqual(1);
    expect(Date.parse(ticket!.endTime)).toBeGreaterThan(Date.now());
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=api lite-public`
Expected: FAIL — TypeScript error: `Property 'tickets' does not exist on type 'LiteApi'` / `ticketId` not on `E2EEvent`.

- [ ] **Step 4: Add the types**

Append to `src/api/types.ts`:

```ts
/** GET lite/v1/events/:eventId/tickets?showHidden=false (enveloped array) */
export interface LiteTicket {
  id: string;
  title: string;
  type: 'individual' | string;
  price: number; // cents
  fee: number;
  numberAvailable: number; // 0 = sold out on the public site
  maxPerOrder: number;
  startTime: string;
  endTime: string; // ISO; sales stop after this
  seatCount: number;
  status: 'active' | string;
  hidden: boolean;
  itemQuestions: unknown[];
}

/** GET/POST ems/v1/iBid/events/:eventId/tickets/:ticketId (enveloped) — the CMS's own ticket record */
export interface IBidTicket {
  id: string;
  eventId: string;
  title: string;
  status: 'active' | string;
  startTime: string;
  endTime: string;
  sortNumber: number;
  externalId: string;
  hidden: boolean;
  price: number;
  numberAvailable: number;
  maxPerOrder: number;
  fee: number;
  ticketType: string;
  seatCount: number;
  itemQuestions: unknown[];
  estimate: number;
  promotionCodeIds: string[];
  enableGuestDetailCutOffTime: boolean;
  guestDetailCutOffTime: string;
  guestDetailCutOffCopy: string;
  created?: string;
  updated?: string;
}

/** POST checkin/v1/events/:eventId/guests/:guestId/ticketPurchases (BARE ARRAY; HTTP 200 even when `code` is "soldOut") */
export interface CheckinTicketPurchaseResult {
  id: string; // purchase id — pass to cancelTicketPurchase
  ticketId: string;
  code: 'accepted' | 'soldOut' | string;
  message: string;
  amount: number;
  count: number;
  available: number;
  bought: number;
}

/** One line of GuestCheckout.ticketPurchases */
export interface CheckoutTicketPurchase {
  itemId: string; // ticket id
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

Then in the existing `GuestCheckout` interface change `ticketPurchases: unknown[];` to `ticketPurchases: CheckoutTicketPurchase[];`.

- [ ] **Step 5: Add `LiteApi.tickets` and the `EmsApi` methods**

In `src/api/LiteApi.ts`, extend the import to `import { LiteEvent, LiteTicket, PledgeItem } from './types';` and add the method:

```ts
  /** Tickets currently shown on the public site (hidden ones excluded). */
  tickets(eventId: string) {
    return this.http.get<LiteTicket[]>(`v1/events/${eventId}/tickets`, { showHidden: 'false' });
  }
```

In `src/api/EmsApi.ts`, extend the types import to include `CheckinTicketPurchaseResult, IBidTicket`, then add a new property block after `guests`:

```ts
  /** The CMS's own ticket records (the "iBid" API the CMS Next Tickets pages save through). */
  readonly tickets = {
    get: (eventId: string, ticketId: string) => this.http.get<IBidTicket>(`v1/iBid/events/${eventId}/tickets/${ticketId}`),

    /** Full-record update — send the whole ticket (as returned by `get`) with the changed fields. */
    update: (eventId: string, ticketId: string, ticket: IBidTicket) =>
      this.http.post<unknown>(`v1/iBid/events/${eventId}/tickets/${ticketId}`, ticket),
  };
```

and inside `checkin`, after `cancelDonation`:

```ts
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
```

- [ ] **Step 6: Expose `ticketId` on the fixture**

In `tests/fixtures.ts`, add to `E2EEvent`:

```ts
  /** The pre-created "QA E2E Ticket" ($20) that api-setup keeps sellable. */
  ticketId: string;
```

and to the `e2eEvent` fixture object: `ticketId: env.e2e.ticketId,`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run typecheck && npx playwright test --project=api-setup --project=api lite-public`
Expected: typecheck clean; `4 passed` (1 setup + 3).

- [ ] **Step 8: Commit**

```bash
git add .env.example src/config/env.ts src/api/types.ts src/api/LiteApi.ts src/api/EmsApi.ts tests/fixtures.ts tests/api/lite-public.api.spec.ts
git status --short   # no .env
git commit -m "feat(api): ticket types, LiteApi.tickets, iBid ticket get/update, check-in ticket purchase/cancel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Self-healing ticket fixture in `api-setup`

**Files:**
- Create: `src/api/ticketFixture.ts`
- Modify: `tests/setup/api.setup.ts`
- Test: `tests/api/tickets.api.spec.ts` (first test only — the file grows in Task 3)

**Interfaces:**
- Consumes: `EmsApi.tickets.get/update`, `IBidTicket` (Task 1), `env.e2e.ticketId`.
- Produces: `ensureTicketSellable(ems: EmsApi, eventId: string, ticketId: string): Promise<IBidTicket>`; constants `SELLABLE_MIN_AVAILABLE = 100`, `SELLABLE_MIN_DAYS_LEFT = 30`.

Why: the CMS creates tickets with `numberAvailable: 0` (public site shows "Sold Out") and a 24-hour sale window. Both were fixed by hand once; this step makes every run repair drift itself.

- [ ] **Step 1: Write the failing test**

Create `tests/api/tickets.api.spec.ts`:

```ts
import { test, expect } from '../fixtures';
import { SELLABLE_MIN_AVAILABLE, SELLABLE_MIN_DAYS_LEFT } from '../../src/api/ticketFixture';

const DAY_MS = 86_400_000;

test.describe('EMS iBid API > fixture ticket', () => {
  test('api-setup leaves the fixture ticket sellable for at least a month', async ({ ems, e2eEvent }) => {
    const ticket = await ems.tickets.get(e2eEvent.id, e2eEvent.ticketId);
    expect(ticket).toMatchObject({ id: e2eEvent.ticketId, status: 'active', hidden: false, price: 2000 });
    expect(ticket.numberAvailable).toBeGreaterThanOrEqual(SELLABLE_MIN_AVAILABLE);
    expect((Date.parse(ticket.endTime) - Date.now()) / DAY_MS).toBeGreaterThan(SELLABLE_MIN_DAYS_LEFT);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=api tickets.api`
Expected: FAIL — `Cannot find module '../../src/api/ticketFixture'`.

- [ ] **Step 3: Create `src/api/ticketFixture.ts`**

```ts
import { EmsApi } from './EmsApi';
import { IBidTicket } from './types';

/** Below this the fixture is topped back up to 1000 (each e2e run consumes 1). */
export const SELLABLE_MIN_AVAILABLE = 100;
/** Below this many days of sale window left, the sale end is pushed out again. */
export const SELLABLE_MIN_DAYS_LEFT = 30;
const RESTOCK_TO = 1000;
const FAR_FUTURE_END = '2030-12-31T23:00:00.000+00:00';
const DAY_MS = 86_400_000;

function isSellable(t: IBidTicket): boolean {
  const daysLeft = (Date.parse(t.endTime) - Date.now()) / DAY_MS;
  return t.status === 'active' && !t.hidden && t.numberAvailable >= SELLABLE_MIN_AVAILABLE && daysLeft >= SELLABLE_MIN_DAYS_LEFT;
}

/**
 * Idempotently makes the pre-created fixture ticket purchasable on the public
 * site. The CMS "Create ticket" flow leaves `numberAvailable: 0` ("Sold Out")
 * and a 24 h sale window, and every e2e run consumes one ticket — so without
 * this, the ticket journey would silently start failing. Reads the ticket via
 * the iBid API and, only when needed, writes it back with stock restored to
 * 1000, the sale end far in the future, status active and not hidden. Throws an
 * actionable error if the write did not take.
 */
export async function ensureTicketSellable(ems: EmsApi, eventId: string, ticketId: string): Promise<IBidTicket> {
  const ticket = await ems.tickets.get(eventId, ticketId);
  if (isSellable(ticket)) {
    return ticket;
  }
  await ems.tickets.update(eventId, ticketId, {
    ...ticket,
    status: 'active',
    hidden: false,
    numberAvailable: Math.max(ticket.numberAvailable, RESTOCK_TO),
    endTime: FAR_FUTURE_END,
  });
  const after = await ems.tickets.get(eventId, ticketId);
  if (!isSellable(after)) {
    throw new Error(
      `Fixture ticket ${ticketId} is still not sellable after an iBid update ` +
        `(status=${after.status} hidden=${after.hidden} numberAvailable=${after.numberAvailable} endTime=${after.endTime}). ` +
        `Fix it in the CMS: events/${eventId}/tickets/edit/?id=${ticketId} (Limit ≥ ${RESTOCK_TO}, Sale End far future).`,
    );
  }
  return after;
}
```

- [ ] **Step 4: Call it from `api-setup`**

Replace the body of `tests/setup/api.setup.ts`'s setup test with:

```ts
setup('authenticate against the EMS API and prepare fixtures', async ({ request }) => {
  const token = await EmsApi.login(request, env.cms.username, env.cms.password);
  writeEmsToken(token);
  const ems = new EmsApi(request, token);
  await ems.reports.totals(env.e2e.eventId);
  // Slice 2: the ticket journey needs a ticket that is in stock and on sale.
  await ensureTicketSellable(ems, env.e2e.eventId, env.e2e.ticketId);
});
```

and add `import { ensureTicketSellable } from '../../src/api/ticketFixture';`.

- [ ] **Step 5: Run the test to verify it passes (read path)**

Run: `npx playwright test --project=api-setup --project=api tickets.api`
Expected: `2 passed`.

- [ ] **Step 6: Prove the write path repairs drift**

Deliberately drift the fixture, then let setup heal it:

```bash
npx tsx -e "
import { request } from '@playwright/test';
import { EmsApi } from './src/api/EmsApi';
import { readEmsToken } from './src/api/auth';
import { env } from './src/config/env';
(async () => {
  const ctx = await request.newContext();
  const ems = new EmsApi(ctx, readEmsToken());
  const t = await ems.tickets.get(env.e2e.eventId, env.e2e.ticketId);
  await ems.tickets.update(env.e2e.eventId, env.e2e.ticketId, { ...t, numberAvailable: 50 });
  console.log('drifted to', (await ems.tickets.get(env.e2e.eventId, env.e2e.ticketId)).numberAvailable);
  await ctx.dispose();
})();
"
npx playwright test --project=api-setup --project=api tickets.api
```

Expected: first command prints `drifted to 50`; the test run then passes (`2 passed`) because setup restored `numberAvailable` to 1000. Confirm with the same one-liner printing `numberAvailable` (expected `1000`). If the iBid update is rejected (non-2xx), stop and report BLOCKED with the response body — do not work around it.

- [ ] **Step 7: Commit**

```bash
git add src/api/ticketFixture.ts tests/setup/api.setup.ts tests/api/tickets.api.spec.ts
git commit -m "feat(api-setup): keep the fixture ticket sellable via the iBid API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Check-in ticket purchase API suite

**Files:**
- Modify: `tests/api/tickets.api.spec.ts`

**Interfaces:**
- Consumes: `ems.checkin.purchaseTickets / cancelTicketPurchase`, `ems.guests.checkout`, `e2eEvent.apiGuestId / ticketId` (Task 1), `ApiError` (`status`, `code`, `body`).

Verified behaviour encoded: purchase → HTTP 200 `[{ code: 'accepted', amount: 2000, count: 1, ticketId }]` and the guest's checkout gains a `ticketPurchases` line (`totalAmount: 2000`); cancel → **HTTP 500** (sc-98155) but the line disappears; `count: 0` → 422 `{ errors: [...] }`; unknown ticket → 404 `notFound`; cancel unknown id → 404 `notFound`.

- [ ] **Step 1: Add the tests**

Append to `tests/api/tickets.api.spec.ts` (keep the Task 2 describe; add imports `import { ApiError } from '../../src/api/http';` at the top):

```ts
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** sc-98155: cancel answers 500 but does cancel. Swallow exactly that; anything else is a real failure. */
async function cancelTicketPurchaseTolerating500(ems: import('../../src/api/EmsApi').EmsApi, eventId: string, guestId: string, purchaseId: string) {
  try {
    await ems.checkin.cancelTicketPurchase(eventId, guestId, purchaseId);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 500)) throw e;
  }
}

// Reserves and cancels real ticket purchases for the QA guest — serial, self-cleaning.
test.describe.serial('EMS check-in API > ticket purchases (reserve / cancel)', () => {
  test('reserving one ticket puts a $20 line in the guest basket; cancelling removes it', async ({ ems, e2eEvent }) => {
    const before = await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId);
    const linesBefore = before.ticketPurchases.filter((t) => t.itemId === e2eEvent.ticketId).length;

    const [result] = await ems.checkin.purchaseTickets(e2eEvent.id, e2eEvent.apiGuestId, { ticketId: e2eEvent.ticketId, count: 1 });
    try {
      expect(result).toMatchObject({ code: 'accepted', ticketId: e2eEvent.ticketId, amount: 2000, count: 1 });
      await expect
        .poll(async () => {
          const c = await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId);
          return c.ticketPurchases.filter((t) => t.itemId === e2eEvent.ticketId).length;
        }, { timeout: 15_000 })
        .toBe(linesBefore + 1);
      const during = await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId);
      expect(during.ticketPurchases).toContainEqual(
        expect.objectContaining({ itemId: e2eEvent.ticketId, purchaseId: result.id, itemCount: 1, totalAmount: 2000 }),
      );
      expect(during.grandTotal - before.grandTotal).toBe(2000);
    } finally {
      await cancelTicketPurchaseTolerating500(ems, e2eEvent.id, e2eEvent.apiGuestId, result.id);
    }

    await expect
      .poll(async () => {
        const c = await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId);
        return c.ticketPurchases.filter((t) => t.itemId === e2eEvent.ticketId).length;
      }, { timeout: 15_000 })
      .toBe(linesBefore);
    expect((await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId)).grandTotal).toBe(before.grandTotal);
  });

  test('cancelling a ticket purchase should return 200 (known bug sc-98155: returns 500)', async ({ ems, e2eEvent }) => {
    test.fail(true, 'sc-98155 — ticketPurchases/cancel returns HTTP 500 although the purchase is cancelled. Remove this annotation when fixed.');
    const [result] = await ems.checkin.purchaseTickets(e2eEvent.id, e2eEvent.apiGuestId, { ticketId: e2eEvent.ticketId, count: 1 });
    expect(result.code).toBe('accepted');
    try {
      await ems.checkin.cancelTicketPurchase(e2eEvent.id, e2eEvent.apiGuestId, result.id); // throws ApiError(500) today
    } finally {
      await cancelTicketPurchaseTolerating500(ems, e2eEvent.id, e2eEvent.apiGuestId, result.id);
    }
  });
});

test.describe('EMS check-in API > ticket purchases (validation)', () => {
  test('count 0 is rejected with 422', async ({ ems, e2eEvent }) => {
    const error = await ems.checkin
      .purchaseTickets(e2eEvent.id, e2eEvent.apiGuestId, { ticketId: e2eEvent.ticketId, count: 0 })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422 });
    expect((error as ApiError).body).toEqual(expect.objectContaining({ errors: expect.arrayContaining([expect.stringMatching(/count/)]) }));
  });

  test('an unknown ticket id returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(
      ems.checkin.purchaseTickets(e2eEvent.id, e2eEvent.apiGuestId, { ticketId: ZERO_UUID, count: 1 }),
    ).rejects.toMatchObject({ status: 404, code: 'notFound' });
  });

  test('cancelling an unknown ticket purchase returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(ems.checkin.cancelTicketPurchase(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID)).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });
});
```

- [ ] **Step 2: Run twice to prove self-cleaning**

Run: `npx playwright test --project=api-setup --project=api tickets.api && npx playwright test --project=api-setup --project=api tickets.api`
Expected each time: `6 passed` (1 setup + fixture test + 5) — the sc-98155 test shows as **expected failure** (counted as passed). If it instead reports "passed unexpectedly", the bug was fixed: remove `test.fail` and the tolerate-500 helper's catch, and say so in the report.

- [ ] **Step 3: Commit**

```bash
git add tests/api/tickets.api.spec.ts
git commit -m "test(api): check-in ticket purchase reserve/cancel/validation suite (documents sc-98155)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Lite page objects — tickets page and booking wizard through Step 4's total

**Files:**
- Create: `src/pages/lite/tickets/TicketsPage.ts`, `src/pages/lite/tickets/TicketBookingPage.ts`
- Test: `tests/e2e/tickets.spec.ts` (partial journey; completed in Task 5)

**Interfaces:**
- Consumes: `LiteBasePage` (`gotoLite(controller, action?, params?)`), `LiteSignInPage.continueWithEmail`, `LiteRegisterPage` (`waitForPage/fillDetails/fillCard/setCoverProcessingFee/submit`), `OptInsPage.continueWithDefaults`, `newE2EDonor`, `STRIPE_TEST_CARD`, `usd(cents)`, `lite.tickets`, `e2eEvent.ticketId`.
- Produces: `TicketsPage.goto()`, `.addTicket(title: string, quantity = 1)`, `.buyTickets()`; `TicketBookingPage.waitForOrderSummary(title: string)`, `.continueFromOrderSummary()`, `.continueFromBookingDetails()`, `.assignTicketsLater()`, `.setFees(on: boolean)`, `.expectTotal(cents: number)`. (Task 5 adds `.payWithSavedCard(last4?)`.)

Verified DOM facts: the tickets page lists each ticket with `button "-"`, a quantity `textbox`, `button "+"`; "Buy Tickets" enables once a ticket is selected and, for an anonymous visitor, redirects to sign-in with `silentRedirect=?controller=tickets&action=order`. After registration (which carries the order) and the opt-ins page, the site lands on `?controller=tickets&action=booking`. The wizard is an accordion: `button "Step 1 - Order Summary"` … `"Step 4 - Review & Payment"`, each with a `region` of the same name. Step 1's **Continue is a sibling of its region** (use `page.getByRole('button', { name: 'Continue', exact: true }).first()`); Step 2's Continue is inside its region and POSTs `ticket-purchases/:id/booking-details`; Step 3 shows radios (`label[for$="share-public-link-no"]` = "No, I'll assign all tickets myself") which reveal an "Assign to me" form plus the link **"Add later"** (POSTs `ticket-bookings/:id`); Step 4 has `input[name="applyTicketBookingFees"]` and `input[name="applyPremiums"]` inside `label.switch` (Step 1 has its own `applyPremiums` — always scope to Step 4's region), text "Total $24.95" → "Total $20.00" with both off.

- [ ] **Step 1: Write the failing (partial) journey test**

Create `tests/e2e/tickets.spec.ts`:

```ts
import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { TicketsPage } from '../../src/pages/lite/tickets/TicketsPage';
import { TicketBookingPage } from '../../src/pages/lite/tickets/TicketBookingPage';

// Serial within the file; `npm run test:e2e` runs lite-e2e with --workers=1.
test.describe.serial('Lite UI > Tickets (donor journey, verified via the EMS API)', () => {
  test('a new donor selects the $20 ticket, registers, and reaches Review & Payment with a $20.00 total', async ({
    page,
    lite,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();
    const ticket = (await lite.tickets(e2eEvent.id)).find((t) => t.id === e2eEvent.ticketId);
    expect(ticket, 'fixture ticket must be on sale (api-setup ensures this)').toBeDefined();
    const price = ticket!.price; // 2000

    // 1. Pick one ticket
    const tickets = new TicketsPage(page);
    await tickets.goto();
    await tickets.addTicket(ticket!.title, 1);
    await tickets.buyTickets();

    // 2. Register (the order travels with the registration)
    await new LiteSignInPage(page).continueWithEmail(donor.email);
    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    expect(guestId).toMatch(/^[0-9a-f-]{36}$/);
    await new OptInsPage(page).continueWithDefaults();

    // 3. Booking wizard up to the payment step
    const booking = new TicketBookingPage(page);
    await booking.waitForOrderSummary(ticket!.title);
    await booking.continueFromOrderSummary();
    await booking.continueFromBookingDetails();
    await booking.assignTicketsLater();
    await booking.setFees(false);
    await booking.expectTotal(price);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 tickets`
Expected: FAIL — `Cannot find module '../../src/pages/lite/tickets/TicketsPage'`.

- [ ] **Step 3: Create `src/pages/lite/tickets/TicketsPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';

/**
 * `?controller=tickets` — "Tickets". Each ticket row has "-" / quantity / "+"
 * controls; "Buy Tickets" enables once at least one ticket is selected. An
 * anonymous visitor is sent to sign-in (the order is carried along and
 * completed right after registration).
 */
export class TicketsPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Tickets', exact: true });
  readonly buyTicketsButton = this.page.getByRole('button', { name: 'Buy Tickets' });

  async goto(): Promise<void> {
    await this.gotoLite('tickets');
    await this.heading.waitFor();
  }

  /** Clicks "+" `quantity` times and confirms the selection summary lists the ticket. */
  async addTicket(title: string, quantity = 1): Promise<void> {
    const plus = this.page.getByRole('button', { name: '+', exact: true }).first();
    for (let i = 0; i < quantity; i++) {
      await plus.click();
    }
    await expect(this.page.locator('main')).toContainText(`x${quantity} ${title}`);
    await expect(this.buyTicketsButton).toBeEnabled();
  }

  async buyTickets(): Promise<void> {
    await this.buyTicketsButton.click();
  }
}
```

- [ ] **Step 4: Create `src/pages/lite/tickets/TicketBookingPage.ts`**

```ts
import { expect, Locator } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';
import { usd } from '../../../utils/money';

/**
 * `?controller=tickets&action=booking` — the 4-step "Tickets Booking" accordion:
 * 1 Order Summary → 2 Booking details → 3 Assign tickets → 4 Review & Payment.
 * Never reload this page: the wizard resets to Step 1, and the unpaid
 * reservation behind it expires after ~10–15 minutes.
 */
export class TicketBookingPage extends LiteBasePage {
  private region(step: number, name: string): Locator {
    return this.page.getByRole('region', { name: `Step ${step} - ${name}` });
  }
  readonly orderSummary = this.region(1, 'Order Summary');
  readonly bookingDetails = this.region(2, 'Booking details');
  readonly assignTickets = this.region(3, 'Assign tickets');
  readonly reviewAndPayment = this.region(4, 'Review & Payment');

  async waitForOrderSummary(ticketTitle: string): Promise<void> {
    await expect(this.orderSummary).toContainText(ticketTitle, { timeout: 30_000 });
  }

  /** Step 1's Continue is a sibling of its region, not inside it — it is the first "Continue" on the page. */
  async continueFromOrderSummary(): Promise<void> {
    await this.page.getByRole('button', { name: 'Continue', exact: true }).first().click();
    await this.bookingDetails.getByRole('textbox', { name: 'First Name' }).waitFor();
  }

  /** Step 2 is prefilled from registration; Continue saves the booking details. */
  async continueFromBookingDetails(): Promise<void> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/ticket-purchases\/[^/]+\/booking-details/.test(r.url()),
        { timeout: 30_000 },
      ),
      this.bookingDetails.getByRole('button', { name: 'Continue', exact: true }).click(),
    ]);
    const body = (await response.json()) as { code: string; message: string };
    if (body.code !== 'ok') {
      throw new Error(`Saving booking details failed: ${body.code} — ${body.message}`);
    }
  }

  /**
   * Step 3: choose "No, I'll assign all tickets myself" (reveals the assignment
   * form) and take the "Add later" shortcut, which books the ticket to the
   * purchaser without sending anyone a ticket email.
   */
  async assignTicketsLater(): Promise<void> {
    await this.assignTickets
      .locator('label[for$="share-public-link-no"]')
      .filter({ hasText: /assign all tickets myself/ })
      .click();
    const addLater = this.assignTickets.getByRole('link', { name: 'Add later' });
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/ticket-bookings\/[^/]+/.test(r.url()),
        { timeout: 30_000 },
      ),
      addLater.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string };
    if (body.code !== 'ok') {
      throw new Error(`Ticket booking failed: ${body.code} — ${body.message}`);
    }
    await this.reviewAndPayment.getByRole('button', { name: /Pay with Card/ }).waitFor({ timeout: 30_000 });
  }

  /**
   * Step 4 has two fee toggles — the $4.00 ticket booking fee and the $0.95
   * processing fee — both hidden inputs inside `label.switch`. Scoped to this
   * step because Step 1 has its own `applyPremiums` toggle.
   */
  async setFees(on: boolean): Promise<void> {
    for (const name of ['applyTicketBookingFees', 'applyPremiums']) {
      const input = this.reviewAndPayment.locator(`input[name="${name}"]`);
      if ((await input.isChecked()) !== on) {
        await this.reviewAndPayment.locator(`label.switch:has(input[name="${name}"])`).click();
      }
      await expect(input).toBeChecked({ checked: on });
    }
  }

  /** e.g. "Total $20.00" once both fees are off. */
  async expectTotal(amountCents: number): Promise<void> {
    await expect(this.reviewAndPayment).toContainText(`Total $${usd(amountCents)}`);
  }
}
```

- [ ] **Step 5: Run the partial journey**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 tickets`
Expected: `2 passed` (~60–90 s). It leaves an unpaid reservation that expires by itself. If it fails, read the trace in `test-results/`; every locator above was verified live on 2026-09-06 — report exactly which step differs.

- [ ] **Step 6: Commit**

```bash
git add src/pages/lite/tickets/TicketsPage.ts src/pages/lite/tickets/TicketBookingPage.ts tests/e2e/tickets.spec.ts
git commit -m "feat(lite): tickets page + booking wizard page objects; partial ticket journey

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Pay, confirm, and verify — the complete ticket journey

**Files:**
- Modify: `src/pages/lite/tickets/TicketBookingPage.ts` (add `payWithSavedCard`)
- Create: `src/pages/lite/tickets/TicketConfirmationPage.ts`, `src/pages/lite/tickets/MyTicketsPage.ts`
- Modify: `tests/e2e/tickets.spec.ts` (extend into the full journey)

**Interfaces:**
- Consumes: Task 4 page objects; `ems.reports.totals`, `ems.guests.paymentTransactions / checkout`; `usdWhole`.
- Produces: `TicketBookingPage.payWithSavedCard(last4 = '4242')`; `TicketConfirmationPage.expectSuccess(cents)`; `MyTicketsPage.goto()`, `.expectAssignedTickets(count)`.

Verified: "Pay with Card" reveals `listbox "Select card"` (option "visa ending with 4242") and `button "Buy Tickets"` (`name="pay"`); confirming POSTs `guests/:g/payment` → `entity.paymentStatus: "paid"` and navigates to `?controller=tickets&action=confirmationForBooking…` with heading "Thank you for your order!", text "Total Paid: $20", `button "View tickets"`. Afterwards `payments/transactions[0]` is `{ status: 'paid', amount: 2000, cardLast4: '4242', paymentTransactions: [{ recordType: 'ticket_purchase', amountPaid: 2000, itemId: <ticketId> }, { recordType: 'ticket_booking_fee', amountPaid: 0 }] }`; the basket is empty; "My Tickets" shows "Assigned Tickets ( 1 )". The paid `itemPurchaseId` differs from the pre-payment reservation id — match on `itemId`.

- [ ] **Step 1: Extend the test into the full journey (fails — modules missing)**

Replace the test body's tail (after `await booking.expectTotal(price);`) and add imports so `tests/e2e/tickets.spec.ts` becomes:

```ts
import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { TicketsPage } from '../../src/pages/lite/tickets/TicketsPage';
import { TicketBookingPage } from '../../src/pages/lite/tickets/TicketBookingPage';
import { TicketConfirmationPage } from '../../src/pages/lite/tickets/TicketConfirmationPage';
import { MyTicketsPage } from '../../src/pages/lite/tickets/MyTicketsPage';

// Serial within the file; `npm run test:e2e` runs lite-e2e with --workers=1.
test.describe.serial('Lite UI > Tickets (donor journey, verified via the EMS API)', () => {
  test('a new donor buys one $20 ticket with a test card, and the EMS API records the paid ticket purchase', async ({
    page,
    ems,
    lite,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();
    const ticket = (await lite.tickets(e2eEvent.id)).find((t) => t.id === e2eEvent.ticketId);
    expect(ticket, 'fixture ticket must be on sale (api-setup ensures this)').toBeDefined();
    const price = ticket!.price; // 2000
    const before = await ems.reports.totals(e2eEvent.id);

    // 1. Pick one ticket
    const tickets = new TicketsPage(page);
    await tickets.goto();
    await tickets.addTicket(ticket!.title, 1);
    await tickets.buyTickets();

    // 2. Register (the order travels with the registration)
    await new LiteSignInPage(page).continueWithEmail(donor.email);
    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    await new OptInsPage(page).continueWithDefaults();

    // 3. Booking wizard: summary → details → assign later → fees off → pay exactly $20.00
    const booking = new TicketBookingPage(page);
    await booking.waitForOrderSummary(ticket!.title);
    await booking.continueFromOrderSummary();
    await booking.continueFromBookingDetails();
    await booking.assignTicketsLater();
    await booking.setFees(false);
    await booking.expectTotal(price);
    await booking.payWithSavedCard();
    await new TicketConfirmationPage(page).expectSuccess(price);

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
      expect.objectContaining({ recordType: 'ticket_purchase', itemId: e2eEvent.ticketId, amountPaid: price, paymentStatus: 'paid', itemCount: 1 }),
    );
    expect(payment.paymentTransactions).toContainEqual(expect.objectContaining({ recordType: 'ticket_booking_fee', amountPaid: 0 }));

    const outstanding = await ems.guests.checkout(e2eEvent.id, guestId);
    expect(outstanding.ticketPurchases).toEqual([]);
    expect(outstanding.grandTotal).toBe(0);

    // Tickets are not part of the fundraising totals — pin that fact.
    const after = await ems.reports.totals(e2eEvent.id);
    expect(after.totalRaised).toBe(before.totalRaised);

    // 5. The donor sees the ticket under My Tickets
    const myTickets = new MyTicketsPage(page);
    await myTickets.goto();
    await myTickets.expectAssignedTickets(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 tickets`
Expected: FAIL — `Cannot find module '../../src/pages/lite/tickets/TicketConfirmationPage'`.

- [ ] **Step 3: Add `payWithSavedCard` to `TicketBookingPage`**

Append inside the class:

```ts
  /**
   * "Pay with Card" reveals the saved card (pre-authorised at registration);
   * "Buy Tickets" (`name="pay"`) charges it — POST …/guests/:id/payment →
   * paymentStatus "paid" — and navigates to the order confirmation.
   */
  async payWithSavedCard(last4 = '4242'): Promise<void> {
    await this.reviewAndPayment.getByRole('button', { name: /Pay with Card/ }).click();
    await expect(
      this.reviewAndPayment.getByRole('listbox', { name: 'Select card' }).getByRole('option', { name: new RegExp(`ending with ${last4}`) }),
    ).toBeVisible();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/payment(\?|$)/.test(r.url()),
        { timeout: 60_000 },
      ),
      this.reviewAndPayment.locator('button[name="pay"]').click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: { paymentStatus: string } | null };
    if (body.code !== 'ok' || body.entity?.paymentStatus !== 'paid') {
      throw new Error(`Ticket payment failed: ${body.code}/${body.entity?.paymentStatus} — ${body.message}`);
    }
  }
```

- [ ] **Step 4: Create `src/pages/lite/tickets/TicketConfirmationPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';
import { usdWhole } from '../../../utils/money';

/**
 * `?controller=tickets&action=confirmationForBooking…` — "Thank you for your order!".
 * Also offers "View tickets" and "Add My Ticket to Google Wallet"; tests never
 * click the wallet link or anything that sends tickets.
 */
export class TicketConfirmationPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Thank you for your order!' });
  readonly viewTicketsButton = this.page.getByRole('button', { name: 'View tickets' });

  async expectSuccess(totalPaidCents: number): Promise<void> {
    await expect(this.page).toHaveURL(/action=confirmationForBooking/, { timeout: 30_000 });
    await expect(this.heading).toBeVisible();
    // Raw DOM text may omit the space after the colon; anchor the amount so $200 can't satisfy $20.
    await expect(this.page.locator('main')).toContainText(new RegExp(`Total Paid:\\s*\\$${usdWhole(totalPaidCents)}(?!\\d)`));
    await expect(this.viewTicketsButton).toBeVisible();
  }
}
```

- [ ] **Step 5: Create `src/pages/lite/tickets/MyTicketsPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';

/** `?controller=myBids&action=tickets` — "My Tickets" (ticket management for a signed-in donor). */
export class MyTicketsPage extends LiteBasePage {
  async goto(): Promise<void> {
    await this.gotoLite('myBids', 'tickets');
    await expect(this.page.locator('main')).toContainText('My Tickets');
  }

  /** e.g. "Assigned Tickets ( 1 )" — the DOM pads the parentheses with spaces. */
  async expectAssignedTickets(count: number): Promise<void> {
    await expect(this.page.locator('main')).toContainText(new RegExp(`Assigned Tickets \\(\\s*${count}\\s*\\)`), { timeout: 30_000 });
  }
}
```

- [ ] **Step 6: Run the full journey twice**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 tickets && npx playwright test --project=api-setup --project=lite-e2e --workers=1 tickets`
Expected: `2 passed` both times (each run registers a fresh donor and buys one real $20 test-mode ticket).

- [ ] **Step 7: Commit**

```bash
git add src/pages/lite/tickets tests/e2e/tickets.spec.ts
git commit -m "feat(lite): pay/confirm/my-tickets page objects; complete ticket journey verified via EMS API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Docs and full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document coverage, fixture, gotchas, bug**

Under "## Current coverage", after the donations bullets, add:

```markdown
- **Tickets — donor journey (Lite UI + EMS API)** (`tests/e2e/tickets.spec.ts`):
  a new donor selects the $20 fixture ticket, registers with a Stripe test
  card, walks the 4-step booking wizard (booking details → "Add later" instead
  of assigning/sending tickets → both fee toggles off), pays exactly $20.00 and
  sees "Thank you for your order!"; the EMS API then shows a paid
  `ticket_purchase` transaction for that ticket, an empty basket, unchanged
  fundraising totals (tickets aren't counted there), and "My Tickets" lists
  the assigned ticket.
- **Tickets — check-in API** (`tests/api/tickets.api.spec.ts`): reserve → $20
  line in the guest basket → cancel → basket restored; `count: 0` → 422;
  unknown ticket / purchase → 404 `notFound`; the cancel-returns-500 bug
  (sc-98155) is pinned with `test.fail` so it flips visibly when fixed.
- **Ticket fixture** — `E2E_TICKET_ID` names a pre-created ticket; `api-setup`
  keeps it sellable through the iBid API (stock ≥ 100, sale end far future,
  active, visible) so the journey never hits "Sold Out" or an expired sale.
```

Under "#### Lite UI (public site) gotchas", append:

```markdown
- **A ticket created through the CMS is "Sold Out" until you set its Limit** —
  `numberAvailable` defaults to 0 and the sale window to 24 hours. The
  fixture is repaired automatically by `api-setup` (`src/api/ticketFixture.ts`)
  via `POST /ems/v1/iBid/events/:e/tickets/:id` (send the whole record back).
- **Unpaid ticket reservations expire after ~10–15 minutes, and reloading the
  booking wizard resets it to Step 1** — never `page.reload()` mid-booking; pay
  in one pass.
- **Step 1's "Continue" is a sibling of its accordion region, not inside it**;
  Step 2's is inside. Step 3 hides everything behind two radios — click the
  visible label ("No, I'll assign all tickets myself"), then "Add later" books
  the ticket to the purchaser without emailing anyone.
- **Step 4 has two fee toggles** (`applyTicketBookingFees` $4.00,
  `applyPremiums` $0.95) and Step 1 has its own `applyPremiums` — scope to the
  Step 4 region or you hit a strict-mode clash. Both off → total $20.00.
- **Tickets don't appear in `reports/totals`** (no tickets bucket) — verify via
  `guests/:g/payments/transactions` (`recordType: "ticket_purchase"`, plus a
  zero `ticket_booking_fee` line) and the basket, not the totals.
- **Check-in `POST …/ticketPurchases` returns a bare array with HTTP 200 even
  on failure (`code: "soldOut"`)**; `…/ticketPurchases/cancel` returns HTTP
  500 but does cancel (sc-98155).
```

Under "### Bugs found while building this", append:

```markdown
- **Check-in `ticketPurchases/cancel` returns HTTP 500 although the purchase is
  cancelled** (3/3 reproductions, server log IDs recorded) — filed as sc-98155.
```

- [ ] **Step 2: Full fundraising verification**

Run: `npm run typecheck && npm run test:fundraising`
Expected: `test:api` → `18 passed` (1 setup + 3 reports + 3 lite-public + 5 donations + 6 tickets, one of the ticket tests reported as an expected failure); `test:e2e` → `3 passed` (1 setup + donation + tickets). Then `npx playwright test --project=setup --project=cms-auth --list | tail -1` still lists the checklist projects (no need to run the 38 — this slice touches no CMS code).

- [ ] **Step 3: Commit**

```bash
git add README.md
git status --short   # only README.md
git commit -m "docs: tickets slice — coverage, self-healing fixture, wizard gotchas, sc-98155

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage (§8 slice 2):** "fixture ticket(s)" → Task 2 (API-based, self-healing — an improvement over the spec's CMS-page-object idea, ruled in the approved design); "buy ticket journey" → Tasks 4–5; "`ticketPurchases/cancel` API" → Task 3 (plus the undocumented purchase endpoint). Deliberately out (per approved design): promo codes, custom questions, attendee assignment/emails, Pay Later / Request Invoice, add-on donations. §5.1 delta pattern: totals asserted unchanged (tickets excluded) and per-guest transactions asserted exactly. §5.2 self-cleaning: Task 3 cancels in `finally`, tolerating only the known 500.
- **Placeholders:** none.
- **Type/name consistency:** `env.e2e.ticketId` ↔ `e2eEvent.ticketId` (Tasks 1–5); `lite.tickets()` returns `LiteTicket[]` with `title`/`price` used in Tasks 4–5; `ems.tickets.get/update` (Tasks 1–2); `ems.checkin.purchaseTickets/cancelTicketPurchase` (Tasks 1, 3); `TicketBookingPage` methods `waitForOrderSummary/continueFromOrderSummary/continueFromBookingDetails/assignTicketsLater/setFees/expectTotal/payWithSavedCard` (Tasks 4–5); counts in Task 6: api = 1 + 3 + 3 + 5 + 6 = 18 tests → **`18 passed`** (fix: lite-public has 3 tests after Task 1, tickets.api has 6 incl. fixture test). e2e = 1 setup + 2 journeys = `3 passed`.
