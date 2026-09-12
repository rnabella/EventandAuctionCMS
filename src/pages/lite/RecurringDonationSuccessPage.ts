import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usdWhole } from '../../utils/money';

/**
 * `?controller=recurringDonations&action=setupSuccess` — "Payment Confirmation" for a new
 * subscription. Verified live 2026-09-12: body reads "Thank you. Your payment has been
 * successful.", "Donation: $10", "Frequency: Monthly", "Recurring donation starts:"/"Recurring
 * donation ends:" dates, "Subtotal: $10", "Total: $10" — all inside a single `<main>`. Matched
 * with `\s*` around the amount the same defensive way `PaymentConfirmationPage` does, since this
 * codebase has already seen this app render a label/figure pair with no text-node space between
 * them even when the accessibility tree reports one.
 */
export class RecurringDonationSuccessPage extends LiteBasePage {
  async expectSuccess(amountCents: number, frequencyLabel: string): Promise<void> {
    await expect(this.page).toHaveURL(/controller=recurringDonations&action=setupSuccess/);
    const main = this.page.locator('main');
    await expect(main).toContainText('Thank you. Your payment has been successful.');
    await expect(main).toContainText(new RegExp(`Donation:\\s*\\$${usdWhole(amountCents)}(?!\\d)`));
    await expect(main).toContainText(new RegExp(`Frequency:\\s*${frequencyLabel}\\b`));
  }
}
