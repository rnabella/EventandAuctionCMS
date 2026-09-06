import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { AUCTION_ITEMS_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Inventory Items" page under Auction Items — checklist item "Upload your
 * inventory auction items". A Donor is required to create an inventory item, so
 * callers must create/select one first (see DonorsPage). Fair Market Value must
 * be greater than 0 or Save silently fails client-side validation with no
 * network request at all — easy to miss without checking the rendered page.
 */
export class InventoryItemsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${AUCTION_ITEMS_ROUTES.inventoryItems}`, { waitUntil: 'networkidle' });
    await this.page.getByRole('button', { name: 'ADD ITEM' }).waitFor({ state: 'visible' });
  }

  private get titleEditor() {
    return this.page.locator('label:has-text("Item Title")').first().locator('xpath=following::div[@contenteditable="true"][1]');
  }

  private get donorCombobox() {
    return this.page.locator('input[role="combobox"][value="Choose Donor"]');
  }

  private get fairMarketValueInput() {
    return this.page.locator('label:has-text("Fair Market Value")').first().locator('xpath=following::input[1]');
  }

  /**
   * The donor Autocomplete searches once per `fill()` rather than continuously —
   * if the donor was created moments ago (e.g. by this same test, or concurrently
   * by another test creating a same-named donor), that one search can miss it
   * before the backend has indexed it. Re-searches a few times rather than
   * trusting a single attempt.
   */
  private async selectDonor(donorName: string) {
    const option = this.page.getByRole('option', { name: donorName, exact: true }).first();
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.donorCombobox.click();
      await this.donorCombobox.fill(donorName);
      if (await option.isVisible({ timeout: 4_000 }).catch(() => false)) {
        // .first(): repeated runs create additional same-named donors (see DonorsPage);
        // any one of them is fine for this test's purposes.
        await option.click();
        return;
      }
    }
    throw new Error(`Donor "${donorName}" never appeared in the search results after ${maxAttempts} attempts`);
  }

  /** Creates a new inventory item for the given (already-existing) donor. Returns the created item's id. */
  async createInventoryItem(title: string, donorName: string, fairMarketValue: number): Promise<string> {
    await this.page.getByRole('button', { name: 'ADD ITEM' }).click();
    await this.page.waitForURL(/\/itemInventory\/create\/$/);

    await this.selectDonor(donorName);

    await this.titleEditor.click();
    await this.titleEditor.fill(title);

    await this.fairMarketValueInput.fill(String(fairMarketValue));

    await this.page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await this.page.waitForURL(/\/itemInventory\/[^/]+\/edit\/$/);

    const match = this.page.url().match(/\/itemInventory\/([^/]+)\/edit\/$/);
    if (!match) {
      throw new Error(`Expected an inventory item id in the URL after saving, got: ${this.page.url()}`);
    }
    return match[1];
  }

  async hasInventoryItem(title: string): Promise<boolean> {
    return (await this.page.locator('tr', { hasText: title }).count()) > 0;
  }

  /** Deletes every inventory item with this exact title. Used by the maintenance cleanup, not the regular test suite. */
  async deleteAllWithTitle(title: string): Promise<number> {
    return this.deleteAllTableRowsMatching(title);
  }
}
