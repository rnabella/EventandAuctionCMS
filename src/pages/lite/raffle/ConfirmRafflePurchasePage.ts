import { LiteBasePage } from '../LiteBasePage';

/**
 * `?controller=gliRaffles&action=confirmRafflePurchase&id=<raffleUuid>` (note:
 * the raffle's UUID here, not its displayNumber) — "Please Confirm Your Ticket
 * Purchase Below". One `input[type=checkbox]` ("I accept Terms and
 * Conditions*", no separate label association) and a
 * `<button name="normalBid">Save & Buy Tickets</button>` that POSTs
 * `lite/v1/events/:id/gli-raffle/purchases` (singular, hyphenated — differs
 * from the plural/list endpoints) then navigates to the existing
 * `?controller=guest&action=checkout` (`CheckoutPage`).
 */
export class ConfirmRafflePurchasePage extends LiteBasePage {
  readonly termsCheckbox = this.page.locator('input[type=checkbox]').first();
  readonly confirmButton = this.page.getByRole('button', { name: 'Save & Buy Tickets' });

  async confirmPurchase(): Promise<void> {
    await this.confirmButton.waitFor();
    await this.termsCheckbox.check({ force: true });
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/gli-raffle\/purchases(\?|$)/.test(r.url()),
      ),
      this.confirmButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string };
    if (body.code !== 'ok') {
      throw new Error(`Raffle purchase failed: ${body.code} — ${body.message}`);
    }
  }
}
