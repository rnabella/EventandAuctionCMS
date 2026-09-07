import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';
import { usd } from '../../../utils/money';

/**
 * `?controller=lots&action=showLot&id=<displayNumber>` — a single lot's page.
 * Silent/sealed lots show a "Place Bid" form; Buy It Now lots show quantity
 * controls and a "Purchase" button instead (see Task 7 for `startPurchase`).
 */
export class LotDetailPage extends LiteBasePage {
  private readonly amountBox = this.page.getByRole('textbox', { name: 'Enter Amount' });
  private readonly placeBidButton = this.page.getByRole('button', { name: 'Place Bid', exact: true });

  /** Fills the bid amount and submits — for an anonymous visitor this redirects to sign-in. */
  async placeBid(amountCents: number): Promise<void> {
    await this.amountBox.waitFor({ state: 'visible', timeout: 15_000 });
    await this.amountBox.fill(String(amountCents / 100));
    await this.placeBidButton.click();
  }

  /** e.g. "Next Minimum Bid $10" (silent) or "Minimum Bid $10" (sealed) — cosmetic label only; the true enforced minimum is the lot's own `minStartPrice`, not this text. */
  async expectMinimumBidLabelVisible(): Promise<void> {
    await expect(this.page.locator('main')).toContainText(/Minimum Bid \$\d/);
  }

  private readonly purchaseButton = this.page.getByRole('button', { name: 'Purchase', exact: true });
  private readonly increaseQuantityButton = this.page.getByRole('button', { name: /^Increased? the quantity/ });

  /** Buy It Now lots default to quantity 1; only click "+" for a larger `quantity`. */
  async startPurchase(quantity = 1): Promise<void> {
    await this.purchaseButton.waitFor({ state: 'visible', timeout: 15_000 });
    for (let i = 1; i < quantity; i++) {
      await this.increaseQuantityButton.click();
    }
    await this.purchaseButton.click();
  }
}
