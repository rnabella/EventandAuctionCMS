import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usdWhole } from '../../utils/money';

/** `?controller=pledges&action=campaignPledge` — "Make a donation". */
export class DonatePage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Make a donation' });
  readonly donateButton = this.page.getByRole('button', { name: 'Donate', exact: true });
  /**
   * The recurring tab's frequency control is a custom dropdown, not a `<select>` — but it DOES
   * expose stable ARIA: the trigger is the page's only `div[role="combobox"]`, and opening it
   * reveals a `role="listbox"` (`aria-label="Frequency options"`) of `role="option"` items. Both
   * roles hold regardless of which value is currently selected, verified live 2026-09-12 by
   * selecting "Monthly" then re-opening to switch back to "Bi-weekly" — no need for the
   * click-the-current-value's-text-to-open trick the plan flagged as fragile.
   */
  private readonly frequencyDropdown = this.page.getByRole('combobox');
  private readonly frequencyOptions = this.page.getByRole('listbox', { name: 'Frequency options' });

  async goto(): Promise<void> {
    await this.gotoLite('pledges', 'campaignPledge');
    await this.heading.waitFor();
  }

  /** Same screen as `goto()`, but opens on the "Recurring" tab instead of "One-Time". */
  async gotoRecurring(): Promise<void> {
    await this.gotoLite('pledges', 'campaignPledge', { activeTab: 'recurring-donation' });
    await this.heading.waitFor();
  }

  /** `frequency` must match a dropdown option's exact text, e.g. "Monthly" or "Bi-weekly" (the default). */
  async selectFrequency(frequency: string): Promise<void> {
    await this.frequencyDropdown.click();
    await this.frequencyOptions.getByRole('option', { name: frequency, exact: true }).click();
  }

  /**
   * Preset tiles are `<label role="radio">` named like "Donate $10 Please donate $10.00".
   * Their aria-checked never updates (selection is a CSS class), so Playwright's
   * `.check()` refuses them — click, then assert the `selected` class instead.
   */
  presetAmount(amountCents: number) {
    return this.page.getByRole('radio', { name: new RegExp(`^Donate \\$${usdWhole(amountCents)}\\b`) });
  }

  async selectPresetAmount(amountCents: number): Promise<void> {
    const tile = this.presetAmount(amountCents);
    await tile.click();
    await expect(tile).toHaveClass(/selected/);
  }

  /** Unauthenticated donors are redirected to sign-in; signed-in donors go straight to confirmation. */
  async clickDonate(): Promise<void> {
    await this.donateButton.click();
  }
}
