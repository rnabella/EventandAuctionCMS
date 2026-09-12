# Recurring Donations E2E + API (Fundraising Suite, Slice 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A donor sets up a $10/month recurring donation on the public Lite UI, authorizing a Stripe test card; the EMS admin API records a real, active Stripe subscription — plus an API-side test for the one thing that is genuinely different about this feature vs. every prior slice: **the e2e test MUST cancel the subscription it creates**, because unlike a one-off donation/ticket/raffle purchase, an uncancelled subscription will keep attempting to charge the test card for years (`cancelAt` defaults to +3 years) on every future run.

**Architecture:** Reuses the existing `DonatePage`/`LiteSignInPage`/`LiteRegisterPage`/`OptInsPage` almost entirely — recurring donation is the SAME Lite page (`?controller=pledges&action=campaignPledge`) with a tab switched to `recurring-donation`, not a separate flow. Two genuinely new pages appear after registration: a "Donation Summary" confirm step and a distinct "Payment Confirmation" success page — both unique to this feature, so both get new page objects. There is **no self-healing fixture** for this slice (it reuses the same "Donations" pledge item already used by slice 1, with no separate stock/date fields to keep sellable). `EmsApi` gains a `subscriptions` group: `list` (a cross-event ADMIN search endpoint that happens to accept the same bearer token as everything else) and `cancel` (event-scoped). No new fixture wiring in `api.setup.ts`.

**Tech Stack:** Playwright `^1.62` (`@playwright/test`), TypeScript 7 strict, `dotenv`. No new dependencies.

**Spec:** No dedicated spec doc exists for this slice — it wasn't in scope when `docs/superpowers/specs/2026-09-06-fundraising-outcome-suite-design.md` was written. Every fact below was verified live on 2026-09-12 by driving the real Lite UI, the real CMS "Regular Giving" admin page, and the real EMS API against the E2E event — treat this plan as the authoritative source for this slice, the same role the spec played for slice 1.

## Global Constraints

- `npm test` (checklist suite) stays untouched and green (38 with the 2 known pre-existing environment-load flakes, not caused by any fundraising-suite branch). Fundraising suite stays green and grows: `test:api` 33 → grows, `test:e2e` 7 → grows.
- No new npm dependencies. Money in **cents**. This slice donates $10 (1000 cents) — the same "Donations" pledge item preset already used by slice 1, no new fixture item.
- Only the E2E event `5a5bef87-a9e7-11f1-90d8-92b18db85c99` / `https://us.test.givergy.com/robteste2eauto1`.
- Donor identities from `newE2EDonor()` only (givergy.com `+seed` emails, `xxx-555-xxxx` mobiles). Stripe test card `4242…`.
- **The recurring-donation page is the SAME URL as the one-off donation page**, `?controller=pledges&action=campaignPledge`, with an extra query param `activeTab=recurring-donation` selecting the "Recurring" tab (the other tab is "One-Time", already covered by slice 1's `DonatePage`/`ConfirmDonationPage`/`CheckoutPage` — do not touch those). Selecting "Recurring" reveals: a frequency dropdown (options, verified live: **Bi-weekly** (default), **Monthly**, **Every 3 Months**, **Every 6 Months**, **Every Year**), a required **Start Date** field (`firstPaymentDate`, defaults to +2 days from today), an optional **"Select End Date"** checkbox revealing a **Cancel At** date field (`cancelAt`, defaults to +3 years from today), and the same 5 preset amount tiles slice 1 already has a locator for (`DonatePage.presetAmount`/`selectPresetAmount` — reuse verbatim, do not duplicate).
- **The donation flow after clicking "Donate" is standard** (`LiteSignInPage.continueWithEmail` → `LiteRegisterPage` → `OptInsPage`, all reused verbatim, zero changes) until registration completes. Then it diverges from every other slice:
  1. Lands on `?controller=pledges&action=recurringDonationSummary` — "Donation Summary": Subscription start/end date, "Monthly Donation Amount" (or whatever the selected frequency's label is), Subtotal, Total, then a **"Pay with Card"** button that (like `CheckoutPage`) reveals the saved card + a confirm button labeled **"Set Up Donation"** (`name="pay"`, NOT "Confirm Payment" — this is not `CheckoutPage`, it needs its own page object).
  2. Clicking "Set Up Donation" POSTs `lite/v1/events/:eventId/guests/:guestId/subscription` with `{totalAmount, subTotalAmount, passOnPaymentFee, recurringInterval: "week"|"month", recurringIntervalCount: number, firstPaymentDate, cancelAt}` (verified live: Bi-weekly → `{recurringInterval:"week", recurringIntervalCount:2}`; Monthly → `{recurringInterval:"month", recurringIntervalCount:1}`). **The response's `entity` IS the full created subscription record** — `id` (internal record id, NOT the Stripe id), `subscriptionId` (the real Stripe `sub_...` id), `subscriptionStatus: "active"`, `firstBillingDate`, `cancelAtDate`, `totalAmount: 0` (nothing charged yet — see below). This is the verification oracle; no separate GET call is needed to confirm creation.
  3. Navigates to `?controller=recurringDonations&action=setupSuccess` — a THIRD new page, "Payment Confirmation" heading (reuses that word but is NOT `PaymentConfirmationPage` — different URL, different body: "Thank you. Your payment has been successful. / Donation: $X / Frequency: Y / Recurring donation starts: … / Recurring donation ends: … / Subtotal: $X / Total: $X"). Needs its own page object.
- **Nothing is charged immediately.** Unlike every other purchase type in this suite, setting up a subscription does NOT create a payment: `guests/:guestId/payments/transactions` stays empty for this guest, and `reports/totals.donation`/`totalRaised` are UNCHANGED after setup (the first real charge happens on `firstPaymentDate`, ~2 days in the future — outside any test's lifetime). Do not assert on totals or payment transactions for this feature; assert on the subscription record itself.
- **There is no check-in/admin API scoped to a single event for reading or creating a guest's subscription** (`checkin/v1/events/:eventId/guests/:guestId/subscription(s)` all 404). The only ways to see a subscription after creation are: (a) the creation response itself (captured directly in the e2e spec — sufficient, no extra API call needed), and (b) a cross-event **admin search** endpoint at `GET v1/iBid/clients/stripe-subscriptions/?view=simple&limit={n}&offset=0&subscription_status={active|...}&q={free text}` — verified live: it accepts the SAME bearer token as the rest of `EmsApi`, is NOT event-scoped in its path (searches across every event/client), but each returned row carries its own `eventId`/`eventName`, so callers must filter client-side to this suite's E2E event. `q` free-texts the guest name (and, per the CMS UI screenshot, apparently the event name too — verify both live during implementation, but guest-name search is the one already confirmed working).
- **Cancelling** a subscription: `PUT v1/iBid/events/:eventId/stripe-subscriptions/:recordId` (the row's own `id` field, NOT `subscriptionId`) with an empty body — verified live to actually cancel on Stripe's side (a second cancel attempt on the same record correctly 404s with Stripe's own `"No such subscription: 'sub_...'"` error, proving the first cancel really deleted it, not just flipped a local flag). **Known eventual-consistency gotcha, verified live:** immediately after a successful cancel, re-querying the `stripe-subscriptions` search list can still show `subscriptionStatus: "active"` for a short window — the list is not guaranteed to reflect the cancellation synchronously (likely webhook-driven on our own backend's side, even though Stripe itself already deleted it). **Do not assert on `subscriptionStatus` flipping to a cancelled value right after calling cancel.** The correct proof-of-cancellation is either (a) trust the cancel call's own HTTP success, or (b) if extra certainty is wanted, poll a second `cancel` call until it 404s (proving the underlying Stripe subscription is gone) — but don't over-engineer this; a single successful cancel call in the e2e spec's cleanup is sufficient given the constraint below.
- **This is the one slice in the whole suite where the e2e test MUST clean up (cancel) after itself, every run, unconditionally** — closer to the auction slice's cancel discipline, but for a different reason: not to reset a shared fixture's "No Bids" state, but because an uncancelled subscription is a REAL, indefinitely-recurring Stripe charge attempt (weekly/monthly/etc., for up to ~3 years by default) against the test card, on an event this project reuses forever. Use a `try/finally` around the assertions, calling `ems.subscriptions.cancel(...)` in `finally`, exactly like the donation/ticket specs' `finally` blocks for their own (much lower-stakes) cleanup, but treat a failure to cancel here as a real problem worth surfacing loudly (log the record id if cancellation fails, so a human can clean it up manually) rather than silently swallowing errors.
- **No self-healing fixture, no `api.setup.ts` changes.** The "Donations" pledge item is not touched by this feature at all — the same one slice 1 already established.
- **No pure-API "create a subscription" path exists** (same class of constraint as the raffle slice's `deviceId` issue, but total here — there is no check-in endpoint at all). The API test suite is limited to: the admin search endpoint's shape/filtering (read-only, safe), and negative-path validation on `cancel` (an unknown record id). The actual create-then-verify-then-cancel journey only happens in the e2e spec, which is also where the mandatory cancel-cleanup lives.
- Nothing secret committed (`.env`, `playwright/.auth/` gitignored). Commits end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/api/types.ts` (modify) | `StripeSubscription` (the admin search row / creation-response entity shape — same shape, verified live), `CreateSubscriptionRequest` |
| `src/api/LiteApi.ts` | **unchanged** — subscription creation happens through the browser (Stripe Elements + guest session), not a pure API call this suite makes itself; no new method needed here |
| `src/api/EmsApi.ts` (modify) | new `subscriptions` group: `list(query, opts)`, `cancel(eventId, recordId)` |
| `tests/api/recurring-donations.api.spec.ts` (create) | admin search shape/filtering (read-only), cancel-unknown-id negative test |
| `src/pages/lite/DonatePage.ts` (modify) | add `gotoRecurring()`, `selectFrequency(frequency)` — reuse existing `presetAmount`/`selectPresetAmount`/`clickDonate` verbatim |
| `src/pages/lite/RecurringDonationSummaryPage.ts` (create) | `?controller=pledges&action=recurringDonationSummary`: "Pay with Card" → "Set Up Donation", returns the created subscription record |
| `src/pages/lite/RecurringDonationSuccessPage.ts` (create) | `?controller=recurringDonations&action=setupSuccess`: verify the confirmation text |
| `tests/e2e/recurring-donation.spec.ts` (create) | the recurring-donation journey, verified via the EMS admin search endpoint, with mandatory cancel cleanup |
| `README.md` (modify) | coverage, gotchas (no-immediate-charge, mandatory cancel, eventual-consistency on cancel, admin-only cross-event verification) |

---

### Task 1: Types and `EmsApi.subscriptions`

**Files:**
- Modify: `src/api/types.ts`, `src/api/EmsApi.ts`
- Test: `tests/api/recurring-donations.api.spec.ts` (created in this task)

**Interfaces:**
- Consumes: `HttpClient` (`get<T>/post<T>`; note this task needs a `put<T>` — check if `HttpClient` already has one from the raffle slice's PATCH-verb fix; if it only added `patch()`, add `put()` the same minimal way, mirroring `post()`).
- Produces: `StripeSubscription` type; `EmsApi.subscriptions.list(query: {q?: string; status?: 'active' | 'all'; limit?: number}): Promise<StripeSubscription[]>`; `EmsApi.subscriptions.cancel(eventId: string, recordId: string): Promise<unknown>`.

- [ ] **Step 1: Check `HttpClient` for a `put` method**

Read `src/api/http.ts`. If it has `get`/`post`/`patch` but no `put`, add one following the exact same shape as `patch()` (added in the raffle slice — `PATCH` and `PUT` both send a body and both delegate to the same private `parse()`, so this should be a 3-line mirror of the existing `patch()` method). If `put` already exists, skip this step.

- [ ] **Step 2: Write the failing test**

Create `tests/api/recurring-donations.api.spec.ts`:

```ts
import { test, expect } from '../fixtures';

test.describe('EMS admin API > Regular Giving (Stripe subscriptions)', () => {
  test('the admin search endpoint accepts the shared bearer token and returns shaped rows', async ({ ems, e2eEvent }) => {
    const rows = await ems.subscriptions.list({ q: 'QA E2E', status: 'all' });
    // This event has had real QA subscriptions created against it before (from live exploration on
    // 2026-09-12); if none currently exist, this just confirms the endpoint itself works and returns [].
    for (const row of rows) {
      expect(row).toMatchObject({
        eventId: expect.any(String),
        guestId: expect.any(String),
        subscriptionId: expect.stringMatching(/^sub_/),
        subscriptionStatus: expect.any(String),
        recurringInterval: expect.any(String),
        recurringIntervalCount: expect.any(Number),
        amount: expect.any(Number),
      });
    }
  });

  test('cancelling an unknown subscription record id 404s', async ({ ems, e2eEvent }) => {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    await expect(ems.subscriptions.cancel(e2eEvent.id, ZERO_UUID)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=api recurring-donations`
Expected: FAIL — `Property 'subscriptions' does not exist on type 'EmsApi'`.

- [ ] **Step 4: Add the type**

Append to `src/api/types.ts`:

```ts
/**
 * GET v1/iBid/clients/stripe-subscriptions/ (BARE array, cross-event admin search) — same shape as
 * the `entity` returned by POST .../guests/:guestId/subscription (creation). Verified live 2026-09-12.
 */
export interface StripeSubscription {
  id: string; // internal record id — use THIS for cancel, not subscriptionId
  eventId: string;
  eventName: string;
  amount: number; // cents, per-charge amount
  l1AccountId: string;
  accountName: string;
  guestId: string;
  guestName: string;
  customerId: string; // Stripe customer id
  productId: string;
  productName: string | null;
  productDescription: string | null;
  priceId: string;
  currency: string;
  recurringInterval: 'week' | 'month' | string;
  recurringIntervalCount: number; // e.g. 2 with interval "week" = bi-weekly
  subscriptionId: string; // the real Stripe subscription id, e.g. "sub_..."
  subscriptionStatus: 'active' | string;
  startDate: string;
  endDate: string;
  passOnPaymentFee: boolean;
  accountId: string; // Stripe Connect account id
  subscriptionType: 'recurring' | string;
  firstBillingDate: string;
  cancelAtDate: string;
  totalAmount: number; // lifetime amount actually charged so far — 0 until the first billing date passes
  totalAppFee: number;
  totalAmountPaidToClient: number;
  lastPaymentDate: string; // epoch (1970-01-01) until the first real charge happens
  created: string;
  updated: string;
}
```

- [ ] **Step 5: Add `EmsApi.subscriptions`**

In `src/api/EmsApi.ts`, import `StripeSubscription`, then add a new group (after `gliRaffles`, before `checkin` — matches the file's existing "resource groups first, then checkin actions" order):

```ts
  /**
   * The CMS's cross-event "Regular Giving" admin list (NOT scoped to one event in its own path —
   * every returned row carries its own eventId/eventName, so callers filter client-side). Same
   * bearer token as every other EmsApi call. Verified live 2026-09-12.
   */
  readonly subscriptions = {
    list: (query: { q?: string; status?: 'active' | 'all'; limit?: number } = {}) =>
      this.http.get<StripeSubscription[]>('v1/iBid/clients/stripe-subscriptions/', {
        view: 'simple',
        limit: query.limit ?? 1000,
        offset: 0,
        subscription_status: query.status === 'all' ? '' : 'active',
        q: query.q ?? '',
      }),

    /**
     * Cancels for real on Stripe's side (verified live: a second cancel on the same record 404s
     * with Stripe's own "No such subscription" error, not a local no-op). KNOWN GOTCHA, verified
     * live: `list()` can still show `subscriptionStatus: "active"` for a short window immediately
     * after a successful cancel — do not assert on that field flipping synchronously.
     */
    cancel: (eventId: string, recordId: string) =>
      this.http.put<unknown>(`v1/iBid/events/${eventId}/stripe-subscriptions/${recordId}`, {}),
  };
```

Double-check the exact query-string param casing/spelling (`subscription_status`, `view`, `q`) against what was verified live — re-verify with a live curl call before trusting this plan's text verbatim, the same discipline every prior slice's plan review applied.

- [ ] **Step 6: Run it to verify it passes**

Run: `npx playwright test --project=api-setup --project=api recurring-donations`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

`feat(api): Stripe subscription admin search and cancel`

---

### Task 2: Lite page objects — recurring tab, summary, and success

**Files:**
- Modify: `src/pages/lite/DonatePage.ts`
- Create: `src/pages/lite/RecurringDonationSummaryPage.ts`, `src/pages/lite/RecurringDonationSuccessPage.ts`

**Interfaces:**
- Consumes: `LiteBasePage`, existing `DonatePage.presetAmount`/`selectPresetAmount`/`clickDonate`.
- Produces: `DonatePage.gotoRecurring()`, `DonatePage.selectFrequency(frequency)`; `RecurringDonationSummaryPage.setUpDonation(): Promise<StripeSubscription-shaped entity>`; `RecurringDonationSuccessPage.expectSuccess(amountCents, frequencyLabel)`.

Live-verified DOM facts (2026-09-12):
- `DonatePage.goto()` already navigates to `?controller=pledges&action=campaignPledge` with no `activeTab` (defaults to "One-Time"). Add `gotoRecurring()` which passes `activeTab: 'recurring-donation'` to `gotoLite()` the same way.
- The frequency control is a custom dropdown (not a `<select>`) whose visible trigger is the CURRENTLY selected value's text (defaults to "Bi-weekly"). Opening it and clicking an option both worked live via `page.getByText('Bi-weekly', {exact:true}).first().click()` to open, then `page.getByText('Monthly', {exact:true}).click()` to pick. This is fragile (depends on knowing the current value to click it open) — **the implementer should re-verify live and prefer a more robust locator if one exists** (e.g., a `role="combobox"`/`role="button"` wrapper, or a stable `aria-label`/class on the dropdown container itself, not the option text) before committing to the click-current-value-to-open pattern. If no better locator exists, document why in a comment, the same way this codebase documents every other UI quirk it couldn't avoid.
- Clicking "Donate" behaves identically to the one-off flow — reuse `DonatePage.clickDonate()` verbatim, no new method needed for the button itself.
- `RecurringDonationSummaryPage`: heading "Donation Summary". A **"Pay with Card"** button reveals the saved card + a **"Set Up Donation"** button (`name="pay"`). Clicking "Set Up Donation" POSTs `lite/v1/events/:eventId/guests/:guestId/subscription` — capture this response the same way `ConfirmRafflePurchasePage.confirmPurchase()`/`LiteRegisterPage.submit()` capture their own creation responses, and return the parsed `entity` (typed as `StripeSubscription`, imported from `../../api/types`) so the e2e spec gets the subscription's `id`/`subscriptionId` directly without a second API call.
- `RecurringDonationSuccessPage`: URL `?controller=recurringDonations&action=setupSuccess`. Body: "Payment Confirmation" heading, "Thank you. Your payment has been successful.", "Donation: $X", "Frequency: Y" (Y is the human label — "Bi-weekly", "Monthly", etc., matching the dropdown's own option text), "Recurring donation starts:"/"Recurring donation ends:" dates, "Subtotal: $X", "Total: $X".

- [ ] **Step 1: Extend `DonatePage.ts`**

Add to the existing class:

```ts
  async gotoRecurring(): Promise<void> {
    await this.gotoLite('pledges', 'campaignPledge', { activeTab: 'recurring-donation' });
    await this.heading.waitFor();
  }

  /** `frequency` must match a dropdown option's exact text, e.g. "Monthly" or "Bi-weekly" (the default). */
  async selectFrequency(frequency: string): Promise<void> {
    // Re-verify this locator live before trusting it — see the plan's DOM-facts note on why
    // the dropdown's open-trigger is fragile (it's whatever the CURRENT value's text is).
    ...
  }
```

- [ ] **Step 2: `RecurringDonationSummaryPage.ts`**

```ts
import { LiteBasePage } from './LiteBasePage';
import { StripeSubscription } from '../../api/types';

/** `?controller=pledges&action=recurringDonationSummary` — "Donation Summary". */
export class RecurringDonationSummaryPage extends LiteBasePage {
  readonly payWithCardButton = this.page.getByRole('button', { name: 'Pay with Card' });
  readonly setUpDonationButton = this.page.getByRole('button', { name: 'Set Up Donation' });

  async waitForPage(): Promise<void> {
    await this.payWithCardButton.waitFor({ timeout: 30_000 });
  }

  /**
   * "Pay with Card" reveals the saved card; "Set Up Donation" creates the subscription
   * (POST .../guests/:guestId/subscription) and returns the created record — this response
   * IS the verification oracle, no separate read is needed to confirm creation.
   */
  async setUpDonation(): Promise<StripeSubscription> {
    await this.payWithCardButton.click();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/subscription(\?|$)/.test(r.url()),
      ),
      this.setUpDonationButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: StripeSubscription | null };
    if (body.code !== 'ok' || !body.entity) {
      throw new Error(`Setting up the recurring donation failed: ${body.code} — ${body.message}`);
    }
    return body.entity;
  }
}
```

- [ ] **Step 3: `RecurringDonationSuccessPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usdWhole } from '../../utils/money';

/** `?controller=recurringDonations&action=setupSuccess` — "Payment Confirmation" for a new subscription. */
export class RecurringDonationSuccessPage extends LiteBasePage {
  async expectSuccess(amountCents: number, frequencyLabel: string): Promise<void> {
    await expect(this.page).toHaveURL(/controller=recurringDonations&action=setupSuccess/);
    const main = this.page.locator('main');
    await expect(main).toContainText('Thank you. Your payment has been successful.');
    await expect(main).toContainText(new RegExp(`Donation:\\s*\\$${usdWhole(amountCents)}(?!\\d)`));
    await expect(main).toContainText(`Frequency: ${frequencyLabel}`);
  }
}
```

(Adjust whitespace/regex details to whatever a live check confirms, the same way `PaymentConfirmationPage` had to for its own "no text-node space" quirk.)

- [ ] **Step 4: Sanity-check all three live**

Before writing the e2e spec, do a throwaway script (same technique used throughout this suite's exploration) that: navigates `DonatePage.gotoRecurring()`, selects "Monthly", picks the $10 preset, clicks Donate, completes sign-in/register/opt-ins, lands on `RecurringDonationSummaryPage`, calls `setUpDonation()`, confirms the returned entity has `subscriptionStatus: 'active'` and `recurringInterval: 'month'`, lands on `RecurringDonationSuccessPage`, confirms the text. **Then immediately cancel the subscription you just created** via `ems.subscriptions.cancel(eventId, entity.id)` (or the CMS admin UI) before deleting the script — do not leave throwaway subscriptions active. Delete the script afterward.

- [ ] **Step 5: Commit**

`feat(lite): recurring-donation tab, summary, and success page objects`

---

### Task 3: The e2e journey (with mandatory cancel cleanup)

**Files:**
- Create: `tests/e2e/recurring-donation.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–2, plus `LiteSignInPage`, `LiteRegisterPage`, `OptInsPage` (unchanged, reused verbatim).

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { DonatePage } from '../../src/pages/lite/DonatePage';
import { RecurringDonationSummaryPage } from '../../src/pages/lite/RecurringDonationSummaryPage';
import { RecurringDonationSuccessPage } from '../../src/pages/lite/RecurringDonationSuccessPage';

// Serial within the file; `npm run test:e2e` runs lite-e2e with --workers=1.
test.describe.serial('Lite UI > Recurring Donations (donor journey, verified via the EMS admin API)', () => {
  test('a new donor sets up a $10 monthly recurring donation with a test card, and it appears as an active Stripe subscription', async ({
    page,
    ems,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();
    const amount = 1000; // $10

    // 1. Pick Monthly + $10, start the donor journey
    const donate = new DonatePage(page);
    await donate.gotoRecurring();
    await donate.selectFrequency('Monthly');
    await donate.selectPresetAmount(amount);
    await donate.clickDonate();

    // 2. Register
    await new LiteSignInPage(page).continueWithEmail(donor.email);
    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    await new OptInsPage(page).continueWithDefaults();

    // 3. Set up the subscription — this call itself is the verification oracle
    const summary = new RecurringDonationSummaryPage(page);
    await summary.waitForPage();
    let subscription;
    try {
      subscription = await summary.setUpDonation();
      expect(subscription).toMatchObject({
        eventId: e2eEvent.id,
        guestId,
        amount,
        recurringInterval: 'month',
        recurringIntervalCount: 1,
        subscriptionStatus: 'active',
        totalAmount: 0, // nothing charged yet — first charge is on firstBillingDate, days in the future
      });
      expect(subscription.subscriptionId).toMatch(/^sub_/);

      await new RecurringDonationSuccessPage(page).expectSuccess(amount, 'Monthly');

      // 4. Cross-check via the EMS admin search — the only other place this subscription is visible
      const rows = await ems.subscriptions.list({ q: donor.lastName, status: 'all' });
      expect(rows).toContainEqual(expect.objectContaining({ id: subscription.id, eventId: e2eEvent.id, subscriptionStatus: 'active' }));
    } finally {
      // MANDATORY cleanup — see the plan's Global Constraints: an uncancelled subscription keeps
      // attempting to charge the test card for years. Log loudly on failure so a human can clean up.
      if (subscription) {
        try {
          await ems.subscriptions.cancel(e2eEvent.id, subscription.id);
        } catch (e) {
          console.error(
            `FAILED TO CANCEL recurring-donation e2e test subscription — clean this up manually via the CMS ` +
              `"Regular Giving" page (search "${donor.lastName}"): record id ${subscription.id}, Stripe id ${subscription.subscriptionId}`,
          );
          throw e;
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run: `npx playwright test --project=api-setup --project=lite-e2e recurring-donation`
Expected: PASS. **Immediately after**, independently confirm via a quick manual check (curl or the CMS admin page) that no stray active subscription for this donor was left behind — the test's own `finally` should have cancelled it, but this is exactly the kind of real-money-adjacent side effect worth a human-style double-check before trusting it blindly the first time this spec ever runs.

- [ ] **Step 3: Run the full fundraising suite**

Run: `npm run test:e2e` (all specs, `--workers=1`). Expected: 8 passed (7 existing + this one). Run `npx playwright test --project=api-setup --project=api recurring-donations` again to confirm the API spec is still green. Do NOT run `npm test` in this task (out of scope) — the final review will do a full-suite pass.

- [ ] **Step 4: Commit**

`feat(lite): recurring-donation journey; complete donor flow verified via EMS admin API, with mandatory cancel cleanup`

---

### Task 4: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update coverage counts and structure**

Add the recurring-donations slice to "Current coverage"/"Structure", matching the format of every prior slice's entry.

- [ ] **Step 2: Document the gotchas found in this slice**

Add a "Recurring Donations gotchas" subsection covering, at minimum:
1. **No immediate charge** — setting up a subscription creates zero payment transactions and moves no totals; the first real charge is on `firstBillingDate`, always a few days out. Verify via the subscription record itself, not `reports/totals` or `payments/transactions`.
2. **This is the only slice that MUST cancel after every e2e run** — an uncancelled subscription keeps attempting to charge the test card for up to ~3 years. Explain why (real recurring Stripe billing, not a shared-fixture-reset concern like the auction slice's cancel discipline).
3. **No event-scoped check-in API for subscriptions at all** — verification only via the creation response itself, or the cross-event admin search endpoint (`v1/iBid/clients/stripe-subscriptions/`), which is NOT scoped by event in its URL (filter client-side on the returned `eventId`).
4. **Cancel is real but eventually-consistent in the list** — a cancelled subscription can still show `subscriptionStatus: "active"` in the search list for a short window; don't assert on that field flipping synchronously after calling cancel.
5. **The CMS has a whole top-level "REGULAR GIVING" nav section** (sibling to "CAMPAIGNS"), a cross-event admin view of every subscription with search + a cancel (✕) action per row — worth knowing about for anyone debugging this feature by hand.
6. Any other real surprise hit during Tasks 1–3 not foreseeable from this plan — document it here in the same dated, "verified live" style as every other entry.

- [ ] **Step 3: Commit**

`docs: recurring-donations slice — coverage, no-immediate-charge and mandatory-cancel gotchas`

---

## Follow-ups (out of scope for this plan, ledger only)

- Frequencies other than Monthly (Bi-weekly, Every 3/6 Months, Every Year) and the optional explicit end-date checkbox are never exercised beyond the frequency dropdown's own selection (the e2e spec only ever completes a Monthly subscription) — deliberately narrow scope, matching this project's "one representative path per slice" convention.
- The pre-existing `donations.api.spec.ts` cross-file `totalRaised` race (ledgered in the raffle slice) is still open.
- Prize Draw remains explicitly out of scope (no CMS admin UI exists for it — see memory `project-fundraising-suite` update 2026-09-12).
