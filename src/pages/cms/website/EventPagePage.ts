import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { SavableCard } from '../components/SavableCard';
import { FUNDRAISING_WEBSITE_ROUTES } from '../../../data/cmsRoutes';

/** The "Event Page" tab under Fundraising Website — checklist item "Set up your dedicated Event Page". */
export class EventPagePage extends BasePage {
  readonly details = new SavableCard(this.page, 'DETAILS');

  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${FUNDRAISING_WEBSITE_ROUTES.eventPage}`);
    await this.details.card.waitFor({ state: 'visible' });
  }

  async setEventName(name: string) {
    await this.details.field('Event Name:').fill(name);
    await this.details.save();
  }

  async getEventName(): Promise<string> {
    return this.details.field('Event Name:').inputValue();
  }

  async setEventAddress(address: string) {
    await this.details.field('Event Address:').fill(address);
    await this.details.save();
  }

  async getEventAddress(): Promise<string> {
    return this.details.field('Event Address:').inputValue();
  }
}
