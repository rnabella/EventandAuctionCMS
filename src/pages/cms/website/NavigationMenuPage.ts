import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { FUNDRAISING_WEBSITE_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Navigation Menu" tab under Fundraising Website — checklist item
 * "Configure your website menu".
 *
 * The menu list is a drag-and-drop tree (not semantic `<li>` elements, no
 * accessible list roles), and adding an item means picking from a dynamic
 * dropdown of not-yet-used pages. That's more surface area than fits this
 * pass, so this page object only verifies the default menu structure renders;
 * add/reorder/remove and the Footer/Home Page Buttons/Home Page Tabs cards
 * are follow-up work (see checklist-driven-backlog memory).
 */
export class NavigationMenuPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private card(heading: string) {
    return this.page
      .getByText(heading, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"MuiPaper-root")][1]');
  }

  get headerMenuCard() {
    return this.card('HEADER MENU');
  }

  get footerMenuCard() {
    return this.card('FOOTER MENU');
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${FUNDRAISING_WEBSITE_ROUTES.navigationMenu}`);
    await this.headerMenuCard.waitFor({ state: 'visible' });
  }

  async hasHeaderMenuItem(label: string): Promise<boolean> {
    return this.headerMenuCard.getByText(label, { exact: true }).isVisible();
  }

  async hasFooterMenuItem(label: string): Promise<boolean> {
    return this.footerMenuCard.getByText(label, { exact: true }).isVisible();
  }
}
