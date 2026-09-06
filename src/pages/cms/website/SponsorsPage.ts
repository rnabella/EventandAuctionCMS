import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { SavableCard } from '../components/SavableCard';
import { FUNDRAISING_WEBSITE_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Sponsors" tab under Fundraising Website — checklist item "Add sponsor
 * highlights". Only the Display Settings card is covered here; creating an
 * actual sponsor (via the "Create New Sponsor" modal, which includes a logo
 * upload) is follow-up work.
 */
export class SponsorsPage extends BasePage {
  readonly displaySettings = new SavableCard(this.page, 'DISPLAY SETTINGS');

  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${FUNDRAISING_WEBSITE_ROUTES.sponsors}`);
    await this.displaySettings.card.waitFor({ state: 'visible' });
  }

  async setShowAfterEveryNumberOfItems(count: number) {
    await this.displaySettings.field('Show after every * number of items:').fill(String(count));
    await this.displaySettings.save();
  }

  async getShowAfterEveryNumberOfItems(): Promise<string> {
    return this.displaySettings.field('Show after every * number of items:').inputValue();
  }
}
