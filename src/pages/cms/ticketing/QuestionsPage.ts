import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { TICKETING_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Questions" tab under Ticketing — checklist item "Configure your questions".
 * Unlike the Website Details cards, the page-level "SAVE" button here is always
 * enabled (no change-detection), and "Add Question" always adds a new row rather
 * than editing an existing one — repeated runs accumulate multiple questions,
 * per the project's test data policy.
 */
export class QuestionsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get saveButton() {
    return this.page.getByRole('button', { name: 'SAVE', exact: true });
  }

  async goto(eventId: string) {
    // The SAVE button is static and visible immediately; the existing questions
    // load via a separate async request afterward, so wait for that to settle
    // too or callers can read stale (pre-load) input values.
    await this.page.goto(`events/${eventId}/${TICKETING_ROUTES.questions}`, { waitUntil: 'networkidle' });
    await this.saveButton.waitFor({ state: 'visible' });
  }

  async addQuestion(questionText: string) {
    await this.page.getByRole('button', { name: 'Add Question' }).click();
    await this.page.getByPlaceholder('Question').last().fill(questionText);
    await this.saveButton.click();
  }

  /**
   * A saved question row collapses into a read-only summary (plain text + an
   * "Edit" link) rather than staying an editable `input[name="question"]` —
   * that only exists for a row currently being added/edited. Check the
   * rendered text instead of an input value.
   */
  // Polls rather than a single-shot count — see DonorsPage.hasDonor's docblock for why.
  async hasQuestion(questionText: string): Promise<boolean> {
    return this.page
      .getByText(questionText, { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Deletes every question with this exact text. Used by the maintenance cleanup,
   * not the regular test suite. Each deletion is a 3-step "expand row, trash
   * icon, CONFIRM dialog" dance, then the page-level SAVE persists it — see
   * `BasePage.deleteAllExpandableRowsWithSave`.
   */
  async deleteAllWithText(questionText: string): Promise<number> {
    return this.deleteAllExpandableRowsWithSave(questionText, this.saveButton);
  }
}
