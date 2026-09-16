import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { TICKETING_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Promotion Codes" tab under Ticketing — checklist item "Create your promo codes".
 * Same page-level SAVE pattern as QuestionsPage (always enabled, "Add" always creates
 * a new row) — repeated runs accumulate multiple codes, per the project's test data policy.
 */
export class PromotionCodesPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get saveButton() {
    return this.page.getByRole('button', { name: 'SAVE', exact: true });
  }

  async goto(eventId: string) {
    // Same as QuestionsPage: existing codes load via a separate async request
    // after the static SAVE button is already visible.
    await this.page.goto(`events/${eventId}/${TICKETING_ROUTES.promotionCodes}`, { waitUntil: 'networkidle' });
    await this.saveButton.waitFor({ state: 'visible' });
  }

  async addPromotionCode(code: string, description: string) {
    await this.page.getByRole('button', { name: 'Add promotion code' }).click();
    await this.page.getByPlaceholder('Code').last().fill(code);
    await this.page.getByPlaceholder('Description').last().fill(description);
    await this.saveButton.click();
  }

  /**
   * Same as QuestionsPage.hasQuestion: a saved row collapses to read-only text, not an input.
   * Polls rather than a single-shot count — see DonorsPage.hasDonor's docblock for why.
   */
  async hasPromotionCode(code: string): Promise<boolean> {
    return this.page
      .getByText(code, { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  }

  /** Deletes every promotion code with this exact code. Same 3-step dance as QuestionsPage.deleteAllWithText. */
  async deleteAllWithCode(code: string): Promise<number> {
    return this.deleteAllExpandableRowsWithSave(code, this.saveButton);
  }
}
