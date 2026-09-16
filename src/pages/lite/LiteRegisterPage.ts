import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { E2EDonor, STRIPE_TEST_CARD } from '../../data/e2eDonor';

type Card = typeof STRIPE_TEST_CARD;

/**
 * `?controller=guest&action=register` — "Enter your details". One form does
 * both jobs: creates the guest (POST lite/v1/events/:id/auth/guests) and
 * pre-authorises a card (POST .../payment/authorize) via Stripe Elements,
 * which render card number / expiry / CVC in three separate iframes.
 */
export class LiteRegisterPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Enter your details' });
  readonly firstName = this.page.getByRole('textbox', { name: 'First Name' });
  readonly lastName = this.page.getByRole('textbox', { name: 'Last Name' });
  readonly mobile = this.page.getByRole('textbox', { name: 'Mobile' });
  readonly password = this.page.getByRole('textbox', { name: /Create Password/ });
  readonly nameOnCard = this.page.getByPlaceholder('Name on card');
  readonly postalCode = this.page.getByPlaceholder('Postal Code');
  /** Checked by default — adds a 3.95% processing fee on top of every payment. */
  readonly paymentFeeCheckbox = this.page.getByRole('checkbox', { name: 'Payment Fee' });
  readonly nextButton = this.page.getByRole('button', { name: 'Next' });

  async waitForPage(): Promise<void> {
    await this.heading.waitFor();
  }

  async fillDetails(donor: E2EDonor): Promise<void> {
    await this.firstName.fill(donor.firstName);
    await this.lastName.fill(donor.lastName);
    await this.mobile.fill(donor.mobile);
    await this.password.fill(donor.password);
  }

  private stripeField(frameTitle: string, placeholder: string) {
    return this.page.frameLocator(`iframe[title="${frameTitle}"]`).getByPlaceholder(placeholder);
  }

  async fillCard(card: Card, nameOnCard: string): Promise<void> {
    await this.stripeField('Secure card number input frame', '1234 1234 1234 1234').fill(card.number);
    await this.stripeField('Secure expiration date input frame', 'MM / YY').fill(card.expiry);
    await this.stripeField('Secure CVC input frame', 'CVC').fill(card.cvc);
    await this.nameOnCard.fill(nameOnCard);
    await this.postalCode.fill(card.postalCode);
  }

  async setCoverProcessingFee(on: boolean): Promise<void> {
    if ((await this.paymentFeeCheckbox.isChecked()) !== on) {
      await this.paymentFeeCheckbox.click({ force: true });
    }
    await expect(this.paymentFeeCheckbox).toBeChecked({ checked: on });
  }

  /**
   * Submits the form and returns the new guest's id, taken from the
   * `auth/guests` response — the E2E test needs it to query this guest's
   * payment transactions through the EMS API afterwards.
   */
  async submit(): Promise<string> {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/auth\/guests(\?|$)/.test(r.url())),
      this.nextButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: { id: string } | null };
    if (body.code !== 'ok' || !body.entity) {
      throw new Error(`Lite registration failed: ${body.code} — ${body.message}`);
    }
    return body.entity.id;
  }
}
