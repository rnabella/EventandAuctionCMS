import { test, expect } from '@playwright/test';
import { ReceiptDetailsPage } from '../../../src/pages/cms/payment/ReceiptDetailsPage';
import { env } from '../../../src/config/env';

test.describe('CMS Payment Collection > Receipt Details', () => {
  test('renders receipt configuration with the organisation details populated (checklist: Configure your receipts)', async ({ page }) => {
    const receiptDetailsPage = new ReceiptDetailsPage(page);
    await receiptDetailsPage.goto(env.testEventId);

    expect(await receiptDetailsPage.getOrganizationName()).not.toBe('');
    // Not toggled on: doing so reveals newly-required fields including a
    // mandatory signature file upload, out of scope for this pass.
    expect(await receiptDetailsPage.isEnableTaxReceiptsChecked()).toBe(false);
  });
});
