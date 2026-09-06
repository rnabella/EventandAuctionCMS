import { test, expect } from '@playwright/test';
import { DonorsPage } from '../../../src/pages/cms/auction/DonorsPage';
import { env } from '../../../src/config/env';

test.describe('CMS Auction Items > Item Donor List', () => {
  test('creates a donor and can select it for a thank-you send (checklist: Thank your item donors)', async ({ page }) => {
    const donorsPage = new DonorsPage(page);
    await donorsPage.goto(env.testEventId);

    const donorName = 'QA Automation Test Donor';
    const donorId = await donorsPage.createDonor(donorName);
    expect(donorId).toMatch(/^[0-9a-f-]{36}$/);

    await donorsPage.goto(env.testEventId);
    expect(await donorsPage.hasDonor(donorName)).toBe(true);

    // Not clicking the send itself — that dispatches a real email. Only verifying
    // the action becomes available once a donor is selected.
    expect(await donorsPage.isSendThankYouEnabled()).toBe(false);
    await donorsPage.selectDonor(donorName);
    expect(await donorsPage.isSendThankYouEnabled()).toBe(true);
  });
});
