import { test, expect } from '@playwright/test';
import { StripeConnectPage } from '../../../src/pages/cms/payment/StripeConnectPage';
import { env } from '../../../src/config/env';

test.describe('CMS Payment Collection > Stripe Connect', () => {
  test('shows a verified, connected Stripe account (checklist: Set up Stripe account for payment collection)', async ({ page }) => {
    const stripeConnectPage = new StripeConnectPage(page);
    await stripeConnectPage.goto(env.testEventId);

    expect(await stripeConnectPage.isVerified()).toBe(true);
    expect(await stripeConnectPage.getStripeAccountId()).toMatch(/^acct_/);
  });
});
