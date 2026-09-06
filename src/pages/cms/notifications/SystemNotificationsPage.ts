import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { NOTIFICATIONS_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Edit System Notifications" page — checklist item "Review & update the
 * default system notifications". A "System Message" must be selected before
 * its fields render. The "Test Message" button is deliberately never clicked —
 * it dispatches a real SMS/email.
 */
export class SystemNotificationsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get systemMessageDropdown() {
    return this.page.getByRole('combobox').first();
  }

  private get saveButton() {
    return this.page.getByRole('button', { name: 'Save', exact: true });
  }

  private get emailSubjectInput() {
    return this.page.locator('label:has-text("Subject")').first().locator('xpath=following::input[1]');
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${NOTIFICATIONS_ROUTES.systemMessages}`, { waitUntil: 'networkidle' });
    await this.systemMessageDropdown.waitFor({ state: 'visible' });
  }

  async selectSystemMessage(name: string) {
    await this.systemMessageDropdown.click();
    await this.page.getByRole('option', { name, exact: true }).click();
    await this.emailSubjectInput.waitFor({ state: 'visible' });
  }

  async setEmailSubject(subject: string) {
    await this.emailSubjectInput.fill(subject);
    await this.emailSubjectInput.blur();
    if (!(await this.saveButton.isEnabled())) {
      return;
    }
    await this.saveButton.click();
  }

  async getEmailSubject(): Promise<string> {
    return this.emailSubjectInput.inputValue();
  }
}
