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
