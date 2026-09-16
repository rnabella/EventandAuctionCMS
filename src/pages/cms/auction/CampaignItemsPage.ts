import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { AUCTION_ITEMS_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Campaign Items" page under Auction Items — checklist item "Upload
 * auction items". Only individual item creation is covered here; the CSV
 * bulk-upload and bulk-image-upload cards are follow-up work (file uploads,
 * same reasoning as the Website Details/Branding deferrals).
 *
 * The first visit each session shows a "Go to Settings or Campaign Items?"
 * interstitial modal — dismissed without checking "Do not ask me again", since
 * that's an account-wide preference this test suite shouldn't change as a
 * side effect.
 */
export class CampaignItemsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${AUCTION_ITEMS_ROUTES.campaignItems}`, { waitUntil: 'networkidle' });
    await this.dismissSettingsOrItemsModalIfPresent();
    // Dismissing the modal (when present) triggers its own list fetch that the initial
    // navigation's networkidle doesn't cover — without waiting for it too, `hasActiveItem` right
    // after `goto()` can read the list before a just-added item has loaded. Only surfaced once
    // accumulated test data cleanup made this page fast enough for the two waits to actually race.
    // This wait must come BEFORE the button-visibility check below, not after: the refetch it
    // waits for can re-render the toolbar (including the button) out from under an
    // already-passed visibility check, which only surfaced as a real, ~1-in-4 intermittent
    // failure on Firefox specifically (verified live 2026-09-16) — the button-visible check needs
    // to be the LAST thing that happens before goto() returns, not the second-to-last.
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.getByRole('button', { name: 'CREATE NEW ITEM' }).waitFor({ state: 'visible' });
  }

  private async dismissSettingsOrItemsModalIfPresent() {
    const modalHeading = this.page.getByText('Auction Item Settings', { exact: true });
    if (await modalHeading.isVisible().catch(() => false)) {
      await this.page.getByRole('button', { name: 'GO TO CAMPAIGN ITEMS' }).click();
    }
  }

  private get titleEditor() {
    return this.page.locator('label:has-text("Title")').first().locator('xpath=following::div[@contenteditable="true"][1]');
  }

  private get itemNumberInput() {
    return this.page.locator('label:has-text("Item Number")').first().locator('xpath=following::input[1]');
  }

  /**
   * Creates a new active auction item, accepting the form's other defaults.
   * Returns the created item's id. Item Number always defaults to "1" and
   * isn't auto-incremented, so a repeated run collides with an item created
   * by a previous run ("Item number already exists", 409) unless given a
   * fresh number here.
   */
  async createAuctionItem(title: string): Promise<string> {
    await this.page.getByRole('button', { name: 'CREATE NEW ITEM' }).click();
    await this.page.waitForURL(/\/lots\/create\/$/);

    await this.titleEditor.click();
    await this.titleEditor.fill(title);
    await this.titleEditor.blur();

    // The form's validation only registers the Item Number change on blur (same
    // pitfall as Branding > Theme Colour) — without it, Save silently no-ops
    // with no network request and no visible error. Item Number uniqueness also
    // appears to be checked asynchronously after blur, so Save must wait for
    // that to settle rather than firing immediately.
    await this.itemNumberInput.fill(String(Date.now() % 100_000));
    await this.itemNumberInput.blur();
    await this.page.waitForTimeout(1000);

    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    await this.page.waitForURL(/\/lots\/edit\/\?id=/);

    const id = new URL(this.page.url()).searchParams.get('id');
    if (!id) {
      throw new Error(`Expected a lot id in the URL after saving, got: ${this.page.url()}`);
    }
    return id;
  }

  /** Polls rather than a single-shot count — see DonorsPage.hasDonor's docblock for why. */
  async hasActiveItem(title: string): Promise<boolean> {
    return this.page
      .locator('tr', { hasText: title })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  }

  /** Deletes every campaign item with this exact title (also used for Givergy catalog items added to the campaign). */
  async deleteAllWithTitle(title: string): Promise<number> {
    return this.deleteAllTableRowsMatching(title);
  }
}
