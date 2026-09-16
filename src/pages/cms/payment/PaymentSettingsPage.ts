import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { PAYMENT_COLLECTION_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Settings" page under Payment Collection — covers two checklist items:
 * "Review the payment method - Donor Tip or Platform fee" (the General
 * Settings section's checkbox) and, read-only only, "Set up the ability for
 * DAF Pay" (the DAFpay section at the bottom of this same page).
 *
 * Unlike Website Details/Ticketing, the whole top section (fees, general
 * settings, payment collection matrix) shares ONE page-level "SAVE" button —
 * there's no per-card scoping to worry about for `enableDonationTip`. The
 * DAFpay section further down has its own separate "Save", but that flow
 * isn't exercised here: the EIN/Organisation field performs a real external
 * registry lookup, out of scope for this pass — only checked for presence.
 */
export class PaymentSettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get saveButton() {
    return this.page.getByRole('button', { name: 'SAVE', exact: true }).first();
  }

  private get allowDonorTipCheckbox() {
    return this.page.locator('input[name="enableDonationTip"]');
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${PAYMENT_COLLECTION_ROUTES.settings}`, { waitUntil: 'networkidle' });
    await this.saveButton.waitFor({ state: 'visible' });
  }

  async setAllowDonorTipOrPlatformFee(checked: boolean) {
    if ((await this.allowDonorTipCheckbox.isChecked()) === checked) {
      return;
    }
    await this.allowDonorTipCheckbox.setChecked(checked);
    await this.saveButton.click();
  }

  async isAllowDonorTipOrPlatformFeeChecked(): Promise<boolean> {
    return this.allowDonorTipCheckbox.isChecked();
  }

  /** Structural check only — see class doc for why the EIN lookup itself isn't exercised. */
  async hasDafPaySection(): Promise<boolean> {
    const heading = this.page.getByText('DAFpay', { exact: true }).first();
    const enableCheckbox = this.page.locator('input[name="enableDafPay"]');
    const einLookupLabel = this.page.getByText('EIN/Organisation lookup:', { exact: true });
    return (await heading.isVisible().catch(() => false)) && (await enableCheckbox.count()) > 0 && (await einLookupLabel.count()) > 0;
  }
}
