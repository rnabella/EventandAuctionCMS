import { Page, expect } from '@playwright/test';

/**
 * Every settings section in the CMS follows the same pattern: a MUI card with
 * a heading and its own "Save" button, which is disabled until a field in the
 * card is changed and becomes disabled again once the save completes. This
 * wraps that pattern so page objects don't each re-implement it.
 */
export class SavableCard {
  constructor(
    private readonly page: Page,
    private readonly heading: string,
  ) {}

  get card() {
    return this.page.getByText(this.heading, { exact: true }).locator('xpath=ancestor::div[contains(@class,"MuiPaper-root")][1]');
  }

  private get saveButton() {
    return this.card.getByRole('button', { name: 'Save', exact: true });
  }

  field(label: string) {
    return this.card.getByLabel(label);
  }

  /**
   * Clicks Save and waits for it to go back to disabled, confirming the save round-trip
   * completed. A no-op if nothing changed (Save stays disabled) — this happens whenever
   * a test fills a fixed, deterministic value that a previous run already saved, so it
   * must not be treated as an error.
   */
  async save() {
    if (!(await this.saveButton.isEnabled())) {
      return;
    }
    await this.saveButton.click();
    await expect(this.saveButton).toBeDisabled();
  }
}
