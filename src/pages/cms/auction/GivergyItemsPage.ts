import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { AUCTION_ITEMS_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Givergy Items" catalog page under Auction Items — checklist item "Add
 * your chosen Givergy Items". This is a pre-populated third-party catalog you
 * select from (not something the test creates), so the test just adds one of
 * the always-present catalog items to the campaign.
 */
export class GivergyItemsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${AUCTION_ITEMS_ROUTES.givergyItems}`, { waitUntil: 'networkidle' });
    await this.page.getByRole('button', { name: 'ADD LOTS' }).waitFor({ state: 'visible' });
  }

  private card(title: string) {
    return this.page.locator('[class*="AuctionItemsGrid_card"]').filter({ hasText: title });
  }

  /**
   * Selects the given catalog item's checkbox and adds it to the campaign.
   * A repeated run re-adding the same catalog item gets a "Selected items
   * already exists: ... Do you want to continue?" confirmation dialog instead
   * of the usual immediate success toast — accepted here since duplicate
   * campaign items are expected under this project's test data policy.
   *
   * Doesn't assert on the success toast staying visible: it can auto-dismiss
   * before this code gets a chance to wait for it, which reads as a failure
   * even though the add genuinely succeeded (confirmed via response logging).
   * The real source of truth is whether the item shows up in Campaign Items
   * afterward, which callers check separately.
   */
  async addCatalogItem(title: string) {
    await this.card(title).getByRole('checkbox').check();
    await this.page.getByRole('button', { name: 'ADD LOTS' }).click();

    const alreadyExistsDialog = this.page.getByText('Selected items already exists', { exact: false });
    if (await alreadyExistsDialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await this.page.getByRole('button', { name: 'OK', exact: true }).click();
    }
    await this.page.waitForLoadState('networkidle');
  }
}
