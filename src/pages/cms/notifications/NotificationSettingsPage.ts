import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { NOTIFICATIONS_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Settings" page under Notifications — checklist item "Review our
 * recommended communication strategy guide" (the guide itself is just a Help
 * link; the actionable content on this page is the SMS/Email sender config).
 * Like Donations > Settings, this is one page-level Save covering both the
 * SMS Settings and Email Settings sub-sections — no per-card scoping.
 */
export class NotificationSettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // .first(): the page also has a separate "Save" button for the Email Header/Footer
  // Images card further down — same label, different card/endpoint.
  private get saveButton() {
    return this.page.getByRole('button', { name: 'Save', exact: true }).first();
  }

  private get smsKeywordInput() {
    return this.page.getByLabel('Keyword:');
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${NOTIFICATIONS_ROUTES.settings}`, { waitUntil: 'networkidle' });
    await this.saveButton.waitFor({ state: 'visible' });
  }

  async setSmsKeyword(keyword: string) {
    await this.smsKeywordInput.fill(keyword);
    await this.smsKeywordInput.blur();
    if (!(await this.saveButton.isEnabled())) {
      return;
    }
    await this.saveButton.click();
  }

  async getSmsKeyword(): Promise<string> {
    return this.smsKeywordInput.inputValue();
  }
}
