import { test, expect } from '../fixtures';
import { ApiError } from '../../src/api/http';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { DonatePage } from '../../src/pages/lite/DonatePage';
import { RecurringDonationSummaryPage } from '../../src/pages/lite/RecurringDonationSummaryPage';
import { RecurringDonationSuccessPage } from '../../src/pages/lite/RecurringDonationSuccessPage';

let createdSubscription: { id: string; subscriptionId: string } | undefined;
let currentDonorLastName: string | undefined;

// MANDATORY cleanup, structured as an afterEach (not the test body's own try/finally) because
// Playwright does NOT run a test's try/finally after a test timeout — it suspends the awaited call
// and moves straight to teardown, so a hang inside setUpDonation()/expectSuccess()/subscriptions.list()
// that exhausts test.setTimeout(240_000) would skip the body's own finally entirely (and with
// `retries: 2` in CI config, up to 3 uncancelled subscriptions per flaky run). Playwright DOES run
// afterEach after a timed-out test, with its own fresh timeout budget, so cleanup lives here instead.
//
// Two mechanisms, each closing a different gap:
//  1. A recorded-subscription cancel — closes the test-timeout gap above; works even if the test
//     body never reaches its own finally.
//  2. A fallback sweep by donor last name, scoped to this event — closes the case where
//     setUpDonation()'s POST succeeds server-side while its own client-side response observation
//     fails (waitForResponse's default 30s timeout is shorter than the test's 240s, or
//     response.json() throws on a truncated body), leaving `createdSubscription` unset even though
//     a real subscription exists. donor.lastName is unique per run (newE2EDonor seeds off Date.now()),
//     so this is precise, not a broad guest-list scan.
test.afterEach(async ({ ems, e2eEvent }) => {
  // Captured rather than immediately re-thrown so a failure here can't skip the sweep below — the
  // two mechanisms must both always get a chance to run, since a primary-cancel failure (e.g. a
  // transient network error) is exactly the kind of case the sweep's independent lookup-by-donor-name
  // can still catch and clean up, even though it isn't the failure mode the sweep was designed for.
  let primaryCancelError: unknown;
  if (createdSubscription) {
    const { id, subscriptionId } = createdSubscription;
    createdSubscription = undefined;
    try {
      await ems.subscriptions.cancel(e2eEvent.id, id);
    } catch (e) {
      console.error(
        `FAILED TO CANCEL recurring-donation e2e test subscription — clean this up manually via the CMS ` +
          `"Regular Giving" page: record id ${id}, Stripe id ${subscriptionId}`,
      );
      primaryCancelError = e;
    }
  }
  if (currentDonorLastName) {
    const lastName = currentDonorLastName;
    currentDonorLastName = undefined;
    const strays = (await ems.subscriptions.list({ q: lastName, status: 'active' })).filter((r) => r.eventId === e2eEvent.id);
    for (const r of strays) {
      try {
        await ems.subscriptions.cancel(r.eventId, r.id);
      } catch (e) {
        // A 404 here is expected, not a failure: `list()`'s `subscriptionStatus` is documented as
        // eventually-consistent after a cancel (a just-cancelled record can still show `active` for
        // a short window), so this sweep can legitimately re-target a record the primary cancel
        // above already cancelled seconds earlier. Per EmsApi.ts's subscriptions.cancel docblock,
        // a 404 on retry against a real, previously-active record is itself proof the subscription
        // is gone from Stripe — i.e. this is the success case, not a cleanup failure.
        if (e instanceof ApiError && e.status === 404) {
          continue;
        }
        console.error(
          `FAILED TO SWEEP-CANCEL stray recurring-donation e2e test subscription for donor "${lastName}" — clean this up ` +
            `manually via the CMS "Regular Giving" page: record id ${r.id}, Stripe id ${r.subscriptionId}`,
        );
        throw e;
      }
    }
  }
  // Surface the primary cancel's failure (if any) only after the sweep has had its chance to run.
  if (primaryCancelError) throw primaryCancelError;
});

// Serial within the file; `npm run test:e2e` runs lite-e2e with --workers=1.
test.describe.serial('Lite UI > Recurring Donations (donor journey, verified via the EMS admin API)', () => {
  test('a new donor sets up a $10 monthly recurring donation with a test card, and it appears as an active Stripe subscription', async ({
    page,
    ems,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();
    currentDonorLastName = donor.lastName;
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
    const subscription = await summary.setUpDonation();
    createdSubscription = { id: subscription.id, subscriptionId: subscription.subscriptionId };
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

    // 4. Cross-check via the EMS admin search — the only other place this subscription is visible.
    // Polled (not a single immediate read) because this slice's own documentation establishes the
    // admin-search list is eventually-consistent for cancellation; creation-side latency is
    // unverified but plausible, and every sibling slice polls its own analogous case (e.g.
    // auction.spec.ts polling lite.lots(...)).
    await expect
      .poll(async () => ems.subscriptions.list({ q: donor.lastName, status: 'all' }), { timeout: 15_000 })
      .toContainEqual(expect.objectContaining({ id: subscription.id, eventId: e2eEvent.id, subscriptionStatus: 'active' }));

    // Cleanup happens in the mandatory test.afterEach above — see its comment for why cleanup lives
    // there instead of a try/finally around this test body.
  });
});
