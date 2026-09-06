import { test, expect } from '@playwright/test';
import { PaymentSettingsPage } from '../../../src/pages/cms/payment/PaymentSettingsPage';
import { env } from '../../../src/config/env';

// Both tests load the same Settings page; the first writes through its single
// page-level Save button, so run serially to avoid any read/write overlap.
test.describe.serial('CMS Payment Collection > Settings', () => {
  test('enables "Allow donor tip or platform fee" and it persists (checklist: Review the payment method - Donor Tip or Platform fee)', async ({ page }) => {
    const paymentSettingsPage = new PaymentSettingsPage(page);
    await paymentSettingsPage.goto(env.testEventId);

    await paymentSettingsPage.setAllowDonorTipOrPlatformFee(true);

    await paymentSettingsPage.goto(env.testEventId);
    expect(await paymentSettingsPage.isAllowDonorTipOrPlatformFeeChecked()).toBe(true);
  });

  test('renders the DAFpay section (checklist: Set up the ability for DAF Pay — structural check only, see class docs)', async ({ page }) => {
    const paymentSettingsPage = new PaymentSettingsPage(page);
    await paymentSettingsPage.goto(env.testEventId);

    expect(await paymentSettingsPage.hasDafPaySection()).toBe(true);
  });
});
