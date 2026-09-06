import { Page, expect } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { NOTIFICATIONS_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Campaigns" (custom notifications) pages — checklist item "Draft,
 * schedule & test your custom notifications". Only "Save as Draft" is
 * exercised: "Test Message" and "Send Now" dispatch real messages, and
 * "Schedule" commits to an actual send time — none of those are safe to
 * automate against a real event. Saving as a draft matches the checklist
 * wording ("Draft, schedule & test") without any real-world side effect,
 * and drafts accumulate every run per this project's test data policy.
 */
export class CustomNotificationsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoCampaigns(eventId: string) {
    await this.page.goto(`events/${eventId}/${NOTIFICATIONS_ROUTES.campaigns}`, { waitUntil: 'networkidle' });
    await this.page.getByRole('button', { name: 'NEW MESSAGE' }).waitFor({ state: 'visible' });
  }

  private get mailingListDropdown() {
    return this.page.getByRole('combobox').filter({ hasText: 'Select Mailing List' });
  }

  private get templateDropdown() {
    return this.page.getByRole('combobox').filter({ hasText: 'Select a template' });
  }

  // The underlying <input> is a visually-hidden MUI Switch part — clicking it
  // directly (even with force) intermittently failed to register. Clicking the
  // visible switch wrapper it's nested in, like a real user would, is reliable.
  private get emailToggleInput() {
    return this.page.locator('text=Email:').locator('xpath=following::input[@type="checkbox"][1]');
  }

  private get emailToggleSwitch() {
    return this.emailToggleInput.locator('xpath=ancestor::span[contains(@class,"MuiSwitch-root")][1]');
  }

  private get saveAsDraftButton() {
    return this.page.getByRole('button', { name: 'Save as Draft' });
  }

  /** From the Campaigns list, opens "New Message", configures it, and saves as a draft. */
  async createDraft(mailingList: string, template: string) {
    await this.page.getByRole('button', { name: 'NEW MESSAGE' }).click();
    await this.page.waitForURL(new RegExp(NOTIFICATIONS_ROUTES.createEditCustomNotification.replace(/\//g, '\\/')));

    await this.mailingListDropdown.click();
    await this.page.getByRole('option', { name: mailingList, exact: true }).click();

    await this.templateDropdown.click();
    await this.page.getByRole('option', { name: template, exact: true }).click();

    // The dropdowns alone don't enable Save — a send channel must also be picked.
    if (!(await this.emailToggleInput.isChecked())) {
      await this.emailToggleSwitch.click();
    }

    await this.saveAsDraftButton.click();
    await this.page.waitForURL((url) => !url.pathname.includes('createEditCustomNotification'));
  }

  async gotoDraftsTab(eventId: string) {
    await this.gotoCampaigns(eventId);
    const draftsTab = this.page.getByRole('tab', { name: 'DRAFTS' });
    await draftsTab.click();
    // Now that the page loads much faster (post test-data cleanup), the click
    // can land before the tab is fully interactive and silently not switch —
    // confirm it actually became the selected tab, not just that it was clicked.
    await expect(draftsTab).toHaveAttribute('aria-selected', 'true');
  }

  async hasDraftWithMailingList(mailingListColumnText: string): Promise<boolean> {
    return (await this.page.locator('tr', { hasText: mailingListColumnText }).count()) > 0;
  }

  /**
   * Deletes every draft named "Custom" (createDraft never names it anything
   * else, so this deletes all drafts this suite has ever created). Same
   * row+trash+confirm pattern as Tickets/Donors/etc, but this dialog's confirm
   * button reads "Delete" (title case) rather than "YES, DELETE" — call
   * `gotoDraftsTab` first. Used by the maintenance cleanup, not the regular suite.
   */
  async deleteAllDrafts(): Promise<number> {
    return this.deleteAllTableRowsMatching('Custom', { confirmButtonName: 'Delete' });
  }
}
