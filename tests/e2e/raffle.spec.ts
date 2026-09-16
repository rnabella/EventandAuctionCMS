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
    await rafflePage.addIndividualEntry(1);
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
      expect.objectContaining({
        recordType: 'gli_raffle_purchase',
        itemId: e2eEvent.raffleId,
        amountPaid: price,
        paymentStatus: 'paid',
        itemCount: 1,
      }),
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
