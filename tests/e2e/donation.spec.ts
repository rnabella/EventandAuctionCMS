import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { DonatePage } from '../../src/pages/lite/DonatePage';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { ConfirmDonationPage } from '../../src/pages/lite/ConfirmDonationPage';

test.describe.serial('Lite UI > Donations (donor journey, verified via the EMS API)', () => {
  test('a new donor registers with a test card and reaches the $10 donation confirmation', async ({ page }) => {
    const donor = newE2EDonor();
    const amount = 1000;

    const donate = new DonatePage(page);
    await donate.goto();
    await donate.selectPresetAmount(amount);
    await donate.clickDonate();

    await new LiteSignInPage(page).continueWithEmail(donor.email);

    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    expect(guestId).toMatch(/^[0-9a-f-]{36}$/);

    await new OptInsPage(page).continueWithDefaults();

    const confirm = new ConfirmDonationPage(page);
    await confirm.waitForPage();
    await confirm.expectAmount(amount);
  });
});
