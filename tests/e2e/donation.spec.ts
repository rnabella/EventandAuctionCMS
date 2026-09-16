import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { DonatePage } from '../../src/pages/lite/DonatePage';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { ConfirmDonationPage } from '../../src/pages/lite/ConfirmDonationPage';
import { CheckoutPage } from '../../src/pages/lite/CheckoutPage';
import { PaymentConfirmationPage } from '../../src/pages/lite/PaymentConfirmationPage';

// Every journey here moves the same event totals — serial within the file, and
// `npm run test:e2e` runs this project with --workers=1.
test.describe.serial('Lite UI > Donations (donor journey, verified via the EMS API)', () => {
  test('a new donor registers, places a $10 donation, pays with a test card, and the EMS API records it', async ({
    page,
    ems,
    e2eEvent,
    totalsDelta,
  }) => {
    test.setTimeout(180_000);
    const donor = newE2EDonor();
    const donorName = `${donor.firstName} ${donor.lastName}`;
    const amount = 1000;
    const totals = await totalsDelta(e2eEvent.id);

    // 1. Choose the amount
    const donate = new DonatePage(page);
    await donate.goto();
    await donate.selectPresetAmount(amount);
    await donate.clickDonate();

    // 2. Register with a pre-authorised test card (no processing fee)
    await new LiteSignInPage(page).continueWithEmail(donor.email);
    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, donorName);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    await new OptInsPage(page).continueWithDefaults();

    // 3. Place the donation — totals move immediately, before payment
    const confirm = new ConfirmDonationPage(page);
    await confirm.waitForPage();
    await confirm.expectAmount(amount);
    const purchaseId = await confirm.placeDonation();
    await totals.expectDelta((t) => t.donation.raised, amount);

    // 4. Pay with the saved card, exactly $10.00
    const checkout = new CheckoutPage(page);
    await checkout.waitForPage();
    await checkout.setCoverProcessingFee(false);
    await checkout.expectTotalPayment(amount);
    await checkout.payWithSavedCard();
    await new PaymentConfirmationPage(page).expectSuccess(amount);

    // 5. Verify through the EMS API
    await expect
      .poll(
        async () =>
          (await ems.guests.paymentTransactions(e2eEvent.id, guestId))
            .filter((p) => p.status === 'paid')
            .reduce((sum, p) => sum + p.amount, 0),
        { timeout: 15_000 },
      )
      .toBe(amount);
    const [payment] = await ems.guests.paymentTransactions(e2eEvent.id, guestId);
    expect(payment).toMatchObject({ status: 'paid', processor: 'stripe', amount, cardLast4: '4242', currency: 'USD' });
    expect(payment.paymentTransactions).toContainEqual(
      expect.objectContaining({ recordType: 'donation', amountPaid: amount, paymentStatus: 'paid', itemPurchaseId: purchaseId }),
    );

    const outstanding = await ems.guests.checkout(e2eEvent.id, guestId);
    expect(outstanding.grandTotal).toBe(0);
    expect(outstanding.donations).toEqual([]);

    const rows = await ems.reports.allDonations(e2eEvent.id);
    expect(rows).toContainEqual(expect.objectContaining({ name: donorName, totalValue: amount, qty: 1 }));

    const after = await totals.now();
    expect(after.donation.raised - totals.before.donation.raised).toBe(amount);
    expect(after.donation.totalDonation - totals.before.donation.totalDonation).toBe(1);
    expect(after.totalRaised - totals.before.totalRaised).toBe(amount);
  });
});
