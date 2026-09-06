import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { SavableCard } from '../components/SavableCard';
import { PAYMENT_COLLECTION_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Receipt Details" page under Payment Collection — checklist item
 * "Configure your receipts". Three independent cards, each with its own Save:
 * Shared Organisation Details (already has real-looking org/address data on
 * the Integration event — left untouched here), Transaction Receipt Settings
 * (rich text, deferred like other rich-text fields), and Tax Receipt Settings.
 *
 * Tax Receipt Settings is read-only here, not CRUD: checking "Enable tax
 * receipts" reveals several newly-required fields, including a mandatory
 * signature file upload — the same file-upload boundary this whole project
 * has deferred elsewhere, so there's no safe way to actually save it enabled
 * without also automating a file upload.
 *
 * This page's card headings are visually all-caps via CSS text-transform
 * only — the real DOM text is title case ("Tax Receipt Settings"). SavableCard's
 * heading match is case-sensitive (exact: true), so the visual all-caps text
 * silently matches nothing here. Always check the actual DOM text, not the
 * screenshot, before wiring up a new SavableCard.
 */
export class ReceiptDetailsPage extends BasePage {
  readonly taxReceiptSettings = new SavableCard(this.page, 'Tax Receipt Settings');

  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${PAYMENT_COLLECTION_ROUTES.receiptDetails}`, { waitUntil: 'networkidle' });
    await this.taxReceiptSettings.card.waitFor({ state: 'visible' });
  }

  async isEnableTaxReceiptsChecked(): Promise<boolean> {
    return this.taxReceiptSettings.card.locator('input[type="checkbox"]').first().isChecked();
  }

  async getOrganizationName(): Promise<string> {
    return this.page.locator('input[name="charityName"]').inputValue();
  }
}
