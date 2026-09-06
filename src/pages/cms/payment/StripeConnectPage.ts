import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { PAYMENT_COLLECTION_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Settings" tab under Payment Collection > Stripe Payments — checklist
 * item "Set up Stripe account for payment collection". Read-only: actually
 * connecting/reconfiguring a Stripe account is a real external OAuth flow
 * with real financial implications, out of scope for this suite. This just
 * verifies the Integration environment's existing connected account still
 * shows as verified.
 */
export class StripeConnectPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${PAYMENT_COLLECTION_ROUTES.stripeConnect}`, { waitUntil: 'networkidle' });
    await this.page.getByText('BANK DETAILS', { exact: false }).first().waitFor({ state: 'visible' });
  }

  async isVerified(): Promise<boolean> {
    return this.page.getByText('BANK DETAILS (VERIFIED)', { exact: true }).first().isVisible();
  }

  async getStripeAccountId(): Promise<string> {
    return this.page.locator('label:has-text("Stripe Account Id")').first().locator('xpath=following::p[1]').innerText();
  }
}
