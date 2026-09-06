import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usdWhole } from '../../utils/money';

/**
 * `?controller=pledges&action=confirmDonation` — "Confirm Your Donation".
 * "Place Donation" commits the pledge (POST .../guests/:id/donations); the
 * event's totals move immediately, BEFORE payment. Payment happens next on
 * the checkout page.
 */
export class ConfirmDonationPage extends LiteBasePage {
  readonly placeDonationButton = this.page.getByRole('button', { name: 'Place Donation' });

  async waitForPage(): Promise<void> {
    await this.placeDonationButton.waitFor();
  }

  async expectAmount(amountCents: number): Promise<void> {
    await expect(this.page.locator('main')).toContainText(`Your Donation: $${usdWhole(amountCents)}`);
  }

  /** Returns the purchase id the back end assigned to this donation. */
  async placeDonation(): Promise<string> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/donations(\?|$)/.test(r.url()),
      ),
      this.placeDonationButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: { code: string; purchaseId: string } | null };
    if (body.code !== 'ok' || body.entity?.code !== 'accepted') {
      throw new Error(`Placing the donation failed: ${body.code}/${body.entity?.code} — ${body.message}`);
    }
    return body.entity.purchaseId;
  }
}
