import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usdWhole } from '../../utils/money';

/**
 * `?controller=guest&action=confirmPayment` — "Thank You! Your payment has been
 * successful." Also offers "Download receipt" and "Set Up Donation" (recurring);
 * neither is ever clicked by tests.
 */
export class PaymentConfirmationPage extends LiteBasePage {
  // The accessibility tree renders this as "Download receipt", but it's an <a href="javascript:void(0)">,
  // not a <button> — confirmed via the error-context accessibility snapshot on a live run.
  readonly downloadReceiptButton = this.page.getByRole('link', { name: 'Download receipt' });

  async expectSuccess(amountCents: number): Promise<void> {
    await expect(this.page).toHaveURL(/action=confirmPayment/);
    const main = this.page.locator('main');
    await expect(main).toContainText('Thank You! Your payment has been successful.');
    // The DOM has no text-node space between the label and the figure (e.g. "Donation amount:$10"),
    // even though the accessibility tree reports "Donation amount: $10" — match with optional whitespace.
    await expect(main).toContainText(new RegExp(`Donation amount:\\s*\\$${usdWhole(amountCents)}`));
    await expect(main).toContainText(new RegExp(`Total payment:\\s*\\$${usdWhole(amountCents)}`));
    await expect(this.downloadReceiptButton).toBeVisible();
  }
}
