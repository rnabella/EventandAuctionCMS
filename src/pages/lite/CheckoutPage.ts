import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usd } from '../../utils/money';

/**
 * `?controller=guest&action=checkout` — "Checkout". This page polls
 * `checkout/selected` continuously, so it NEVER reaches `networkidle`; wait
 * for the "Pay with Card" button instead. The processing-fee toggle is a
 * hidden `<input name="applyPremiums">` inside a `<label class="switch">` —
 * click the label, like a user would.
 */
export class CheckoutPage extends LiteBasePage {
  readonly payWithCardButton = this.page.getByRole('button', { name: 'Pay with Card' });
  readonly confirmPaymentButton = this.page.getByRole('button', { name: 'Confirm Payment' });
  readonly cardListbox = this.page.getByRole('listbox', { name: 'Select card' });
  private readonly feeInput = this.page.locator('input[name="applyPremiums"]');
  private readonly feeSwitch = this.page.locator('label.switch:has(input[name="applyPremiums"])');

  async waitForPage(): Promise<void> {
    await this.payWithCardButton.waitFor({ timeout: 30_000 });
  }

  async setCoverProcessingFee(on: boolean): Promise<void> {
    if ((await this.feeInput.isChecked()) !== on) {
      await this.feeSwitch.click();
    }
    await expect(this.feeInput).toBeChecked({ checked: on });
  }

  /** e.g. "Total Payment $10.00" — with the fee off this equals the donation itself. */
  async expectTotalPayment(amountCents: number): Promise<void> {
    await expect(this.page.locator('main')).toContainText(`Total Payment $${usd(amountCents)}`);
  }

  /**
   * "Pay with Card" reveals the saved cards (pre-authorised at registration);
   * "Confirm Payment" charges it (POST .../guests/:id/payment → paymentStatus "paid")
   * and navigates to the confirmation page.
   */
  async payWithSavedCard(last4 = '4242'): Promise<void> {
    await this.payWithCardButton.click();
    await expect(this.cardListbox.getByRole('option', { name: new RegExp(`ending with ${last4}`) })).toBeVisible();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/payment(\?|$)/.test(r.url()),
      ),
      this.confirmPaymentButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: { paymentStatus: string } | null };
    if (body.code !== 'ok' || body.entity?.paymentStatus !== 'paid') {
      throw new Error(`Card payment failed: ${body.code}/${body.entity?.paymentStatus} — ${body.message}`);
    }
  }
}
