import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { LotsPage } from '../../src/pages/lite/auction/LotsPage';
import { LotDetailPage } from '../../src/pages/lite/auction/LotDetailPage';
import { BidConfirmPage } from '../../src/pages/lite/auction/BidConfirmPage';
import { MyActivityPage } from '../../src/pages/lite/auction/MyActivityPage';
import { CheckoutPage } from '../../src/pages/lite/CheckoutPage';

// Serial within the file; `npm run test:e2e` runs lite-e2e with --workers=1.
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
    let bidId: string | undefined;
    try {
      bidId = await confirm.confirmBid();

      const myActivity = new MyActivityPage(page);
      await myActivity.gotoWinning();
      await myActivity.expectListed('QA E2E Silent Lot');

      await expect
        .poll(async () => (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)?.topBidAmount, { timeout: 15_000 })
        .toBe(2500);
      const row = (await ems.reports.bids(e2eEvent.id)).find((r) => r.id === e2eEvent.lotId);
      expect(row).toMatchObject({ bids: 1, totalValue: 2500 });
    } finally {
      // cancelBid is guest-scoped: it must be called with the guest who placed the
      // bid (guestId, from register.submit()), not e2eEvent.apiGuestId — and with the
      // bid's own id (from confirmBid()), not LiteLot.topBidId (see BidConfirmPage).
      if (bidId) {
        await ems.checkin.cancelBid(e2eEvent.id, guestId, bidId).catch(() => {});
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

    let uiDonorGuestId: string | undefined;
    let uiDonorBidId: string | undefined;
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
      uiDonorGuestId = await register.submit();
      await new OptInsPage(page).continueWithDefaults();

      const confirm = new BidConfirmPage(page);
      await confirm.expectConfirmingAmount(5000);
      uiDonorBidId = await confirm.confirmBid();

      await expect
        .poll(async () => (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)?.topBidAmount, { timeout: 15_000 })
        .toBe(5000);
      const outbidLot = (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)!;
      expect(outbidLot.topBidName).toContain(donor.firstName);
      const row = (await ems.reports.bids(e2eEvent.id)).find((r) => r.id === e2eEvent.lotId);
      expect(row).toMatchObject({ bids: 2, totalValue: 5000 });
    } finally {
      // cancelBid is guest-scoped: cancel each bid with the guest who actually placed
      // it (not e2eEvent.apiGuestId for the UI donor's bid) and the bid's own id (not
      // LiteLot.topBidId, which is actually the top bidder's *guest* id — see
      // BidConfirmPage.confirmBid()).
      if (uiDonorGuestId && uiDonorBidId) {
        await ems.checkin.cancelBid(e2eEvent.id, uiDonorGuestId, uiDonorBidId).catch(() => {});
      }
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, firstBid.id).catch(() => {});
    }
    await expect.poll(async () => (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)?.bidCount, { timeout: 15_000 }).toBe(0);
  });
});

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
