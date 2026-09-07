import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';
import { usdWhole } from '../../../utils/money';

/**
 * `?controller=lots&action=confirmBid&id=<lotUuid>&amount=<dollars>&bidMode=<mode>...` —
 * reached after registration, for both a bid ("Please Confirm Your Bid of $N",
 * buttons "Anonymous Bid"/"Place Bid") and a buy-now purchase ("Please Confirm
 * Your Purchase of $N", buttons "Anonymous Buy"/"Buy Now"). Confirming a bid
 * ends here (no payment step — nothing is charged until the auction closes);
 * confirming a purchase navigates on to `?controller=guest&action=checkout`,
 * handled by the existing `CheckoutPage` (see Task 7).
 */
export class BidConfirmPage extends LiteBasePage {
  private readonly placeBidButton = this.page.getByRole('button', { name: 'Place Bid', exact: true });

  /** The heading renders the amount as whole dollars (e.g. "$25", not "$25.00") even for a fractional-cent bid. */
  async expectConfirmingAmount(amountCents: number): Promise<void> {
    await expect(this.page.locator('main')).toContainText(`Please Confirm Your Bid of $${usdWhole(amountCents)}`, { timeout: 15_000 });
  }

  /**
   * Clicks "Place Bid" and waits for the site's own bid POST to report success.
   * Never reaches a payment step. Returns the placed bid's own id (`entity.id`) —
   * needed for cleanup, since `LiteLot.topBidId` (from `LiteApi.lots()`) is
   * actually the top *bidder's guest id*, not the bid's own id (verified live
   * 2026-09-07: cancelling with `topBidId` as the bid id silently no-ops).
   */
  async confirmBid(): Promise<string> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/bids(\?|$)/.test(r.url()),
        { timeout: 30_000 },
      ),
      this.placeBidButton.click(),
    ]);
    const body = (await response.json()) as {
      code: string;
      message: string;
      entity: { code: string; message: string; id: string } | null;
    };
    if (body.code !== 'ok' || body.entity?.code !== 'accepted') {
      throw new Error(`Placing the bid failed: ${body.code}/${body.entity?.code} — ${body.entity?.message ?? body.message}`);
    }
    return body.entity.id;
  }

  private readonly buyNowButton = this.page.getByRole('button', { name: 'Buy Now', exact: true });

  /** Like the bid-confirm heading, this renders whole dollars (e.g. "$50", not "$50.00") — verified live 2026-09-07: the brief's `usd()` produced "$50.00" and never matched. */
  async expectConfirmingPurchaseAmount(amountCents: number): Promise<void> {
    await expect(this.page.locator('main')).toContainText(`Please Confirm Your Purchase of $${usdWhole(amountCents)}`, { timeout: 15_000 });
  }

  /**
   * Clicks "Buy Now" and waits for the site's own buyNow POST to report
   * success. Unlike a bid, this navigates on to the standard checkout page
   * (`?controller=guest&action=checkout`) for payment.
   */
  async confirmPurchase(): Promise<void> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/buyNow(\?|$)/.test(r.url()),
        { timeout: 30_000 },
      ),
      this.buyNowButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: Array<{ code: string; message: string }> | null };
    const first = body.entity?.[0];
    if (body.code !== 'ok' || first?.code !== 'accepted') {
      throw new Error(`Confirming the purchase failed: ${body.code}/${first?.code} — ${first?.message ?? body.message}`);
    }
  }
}
