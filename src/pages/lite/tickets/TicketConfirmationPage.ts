import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';
import { usdWhole } from '../../../utils/money';

/**
 * `?controller=tickets&action=confirmationForBooking…` — "Thank you for your order!".
 * Also offers "View tickets" and "Add My Ticket to Google Wallet"; tests never
 * click the wallet link or anything that sends tickets.
 */
export class TicketConfirmationPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Thank you for your order!' });
  readonly viewTicketsButton = this.page.getByRole('button', { name: 'View tickets' });

  async expectSuccess(totalPaidCents: number): Promise<void> {
    await expect(this.page).toHaveURL(/action=confirmationForBooking/, { timeout: 30_000 });
    await expect(this.heading).toBeVisible();
    // Raw DOM text may omit the space after the colon; anchor the amount so $200 can't satisfy $20.
    await expect(this.page.locator('main')).toContainText(new RegExp(`Total Paid:\\s*\\$${usdWhole(totalPaidCents)}(?!\\d)`));
    await expect(this.viewTicketsButton).toBeVisible();
  }
}
