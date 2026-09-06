import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { AUCTION_ITEMS_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Item Donor List" page under Auction Items — checklist item "Thank your
 * item donors". Only donor creation and selection are covered; actually clicking
 * "SEND DONATED ITEM THANK YOU" is deliberately not exercised since it triggers a
 * real outbound email — this only verifies the button becomes available once a
 * donor is selected.
 */
export class DonorsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get sendThankYouButton() {
    return this.page.getByRole('button', { name: 'SEND DONATED ITEM THANK YOU' });
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${AUCTION_ITEMS_ROUTES.donors}`, { waitUntil: 'networkidle' });
    await this.page.getByRole('button', { name: 'ADD DONOR' }).waitFor({ state: 'visible' });
  }

  /** Creates a new donor. Returns the created donor's id (from the post-save edit URL). */
  async createDonor(name: string): Promise<string> {
    await this.page.getByRole('button', { name: 'ADD DONOR' }).click();
    await this.page.locator('input[name="firstName"]').fill(name);
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    await this.page.waitForURL(/\/lots\/donors\/[^/]+\/edit\/$/);

    const match = this.page.url().match(/\/lots\/donors\/([^/]+)\/edit\/$/);
    if (!match) {
      throw new Error(`Expected a donor id in the URL after saving, got: ${this.page.url()}`);
    }
    return match[1];
  }

  private donorRow(name: string) {
    return this.page.locator('tr', { hasText: name });
  }

  async hasDonor(name: string): Promise<boolean> {
    return (await this.donorRow(name).count()) > 0;
  }

  async selectDonor(name: string) {
    // .first(): repeated runs create additional same-named donors; any one is fine here.
    await this.donorRow(name).first().getByRole('checkbox').check();
  }

  async isSendThankYouEnabled(): Promise<boolean> {
    return this.sendThankYouButton.isEnabled();
  }

  /** Deletes every donor with this exact name. Used by the maintenance cleanup, not the regular test suite. */
  async deleteAllWithName(name: string): Promise<number> {
    return this.deleteAllTableRowsMatching(name);
  }
}
