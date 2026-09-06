import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { DONATIONS_ROUTES } from '../../data/cmsRoutes';

/**
 * The "Settings" page under Donations — checklist item "Configure your
 * donation settings". Unlike Website Details/Ticketing, this page's fields
 * have no `<label for>`/id association at all (not even the container-id
 * mismatch seen on Branding > Theme Colour) — every field here is located by
 * proximity to its label text instead of `getByLabel`. It's also a single
 * card covering the whole page (Amounts/Target/Funds included), so there's
 * only one Save button and no need to scope a "card" the way SavableCard does
 * for Website Details/Ticketing.
 */
export class DonationSettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get saveButton() {
    return this.page.getByRole('button', { name: 'Save', exact: true });
  }

  private get amountLabelInput() {
    return this.page.locator('label:has-text("Amount Label")').first().locator('xpath=following::input[1]');
  }

  private get allowCustomAmountCheckbox() {
    return this.page.locator('label:has-text("Allow custom amount")').first().locator('xpath=following::input[@type="checkbox"][1]');
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${DONATIONS_ROUTES.settings}`, { waitUntil: 'networkidle' });
    await this.saveButton.waitFor({ state: 'visible' });
  }

  private async save() {
    if (!(await this.saveButton.isEnabled())) {
      return; // nothing changed, same no-op reasoning as SavableCard.save()
    }
    await this.saveButton.click();
    await expect(this.saveButton).toBeDisabled();
  }

  async setAmountLabel(label: string) {
    await this.amountLabelInput.fill(label);
    await this.amountLabelInput.blur();
    await this.save();
  }

  async getAmountLabel(): Promise<string> {
    return this.amountLabelInput.inputValue();
  }

  async setAllowCustomAmount(checked: boolean) {
    if ((await this.allowCustomAmountCheckbox.isChecked()) === checked) {
      return;
    }
    await this.allowCustomAmountCheckbox.setChecked(checked);
    await this.save();
  }

  async isAllowCustomAmountChecked(): Promise<boolean> {
    return this.allowCustomAmountCheckbox.isChecked();
  }
}
