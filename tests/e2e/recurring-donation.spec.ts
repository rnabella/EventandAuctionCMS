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
