import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { SavableCard } from '../components/SavableCard';
import { FUNDRAISING_WEBSITE_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Content" tab under Fundraising Website — checklist item "Add your homepage
 * text, homepage image or video and additional info text". Only the Video field is
 * covered here; the rich-text editors (Header/Page Content, FAQ, Gift Aid) and image
 * uploads are follow-up work, see [[cms-ui-technical-notes]] / checklist-driven-backlog.
 */
export class ContentPage extends BasePage {
  readonly homePage = new SavableCard(this.page, 'HOME PAGE');

  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${FUNDRAISING_WEBSITE_ROUTES.content}`);
    await this.homePage.card.waitFor({ state: 'visible' });
  }

  async setHomePageVideoUrl(url: string) {
    await this.homePage.field('Video:').fill(url);
    await this.homePage.save();
  }

  async getHomePageVideoUrl(): Promise<string> {
    return this.homePage.field('Video:').inputValue();
  }
}
