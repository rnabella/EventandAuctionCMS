import { LiteBasePage } from './LiteBasePage';
import { StripeSubscription } from '../../api/types';

/** `?controller=pledges&action=recurringDonationSummary` — "Donation Summary". */
export class RecurringDonationSummaryPage extends LiteBasePage {
  readonly payWithCardButton = this.page.getByRole('button', { name: 'Pay with Card' });
  readonly setUpDonationButton = this.page.getByRole('button', { name: 'Set Up Donation' });

  async waitForPage(): Promise<void> {
    await this.payWithCardButton.waitFor({ timeout: 30_000 });
  }

  /**
   * "Pay with Card" reveals the saved card; "Set Up Donation" creates the subscription
   * (POST .../guests/:guestId/subscription) and returns the created record — this response
   * IS the verification oracle, no separate read is needed to confirm creation.
   */
  async setUpDonation(): Promise<StripeSubscription> {
    await this.payWithCardButton.click();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/subscription(\?|$)/.test(r.url()),
      ),
      this.setUpDonationButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: StripeSubscription | null };
    if (body.code !== 'ok' || !body.entity) {
      throw new Error(`Setting up the recurring donation failed: ${body.code} — ${body.message}`);
    }
    return body.entity;
  }
}
