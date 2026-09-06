import { test, expect } from '@playwright/test';
import { DonationSettingsPage } from '../../../src/pages/cms/DonationSettingsPage';
import { env } from '../../../src/config/env';

// Both tests save through the same page-level Save button/endpoint (there's no
// per-card scoping on this page, unlike Website Details/Ticketing), so they
// must not run concurrently against each other.
test.describe.serial('CMS Donations > Settings', () => {
  let donationSettingsPage: DonationSettingsPage;

  test.beforeEach(async ({ page }) => {
    donationSettingsPage = new DonationSettingsPage(page);
    await donationSettingsPage.goto(env.testEventId);
  });

  test('saves the amount label (checklist: Configure your donation settings)', async () => {
    const testLabel = 'Give Now';
    await donationSettingsPage.setAmountLabel(testLabel);

    await donationSettingsPage.goto(env.testEventId);
    expect(await donationSettingsPage.getAmountLabel()).toBe(testLabel);
  });

  test('enables "Allow custom amount" and it persists', async () => {
    await donationSettingsPage.setAllowCustomAmount(true);

    await donationSettingsPage.goto(env.testEventId);
    expect(await donationSettingsPage.isAllowCustomAmountChecked()).toBe(true);
  });
});
