import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { SavableCard } from '../components/SavableCard';
import { TICKETING_ROUTES } from '../../../data/cmsRoutes';

/** The "Settings" tab under Ticketing — checklist item "Configure your ticket settings". */
export class TicketSettingsPage extends BasePage {
  readonly ticketSettings = new SavableCard(this.page, 'TICKET SETTINGS');

  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${TICKETING_ROUTES.settings}`);
    await this.ticketSettings.card.waitFor({ state: 'visible' });
  }

  async setEnablePayLaterOnWebsite(checked: boolean) {
    const checkbox = this.ticketSettings.field('Enable Pay Later on Website for Tickets:');
    if ((await checkbox.isChecked()) === checked) {
      return;
    }
    await checkbox.setChecked(checked);
    await this.ticketSettings.save();
  }

  async isEnablePayLaterOnWebsiteChecked(): Promise<boolean> {
    return this.ticketSettings.field('Enable Pay Later on Website for Tickets:').isChecked();
  }
}
