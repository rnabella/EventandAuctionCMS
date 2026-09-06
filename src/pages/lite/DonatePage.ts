import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usdWhole } from '../../utils/money';

/** `?controller=pledges&action=campaignPledge` — "Make a donation". */
export class DonatePage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Make a donation' });
  readonly donateButton = this.page.getByRole('button', { name: 'Donate', exact: true });

  async goto(): Promise<void> {
    await this.gotoLite('pledges', 'campaignPledge');
    await this.heading.waitFor();
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
