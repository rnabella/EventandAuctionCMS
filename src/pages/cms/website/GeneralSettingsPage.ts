import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { SavableCard } from '../components/SavableCard';
import { FUNDRAISING_WEBSITE_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "General" tab under Fundraising Website. Covers two checklist items at
 * once: "Set up your website URL" and "Add your social links".
 *
 * The website URL field is deliberately read-only here — it's the live slug
 * this whole test suite's Lite UI URL depends on (see LITE_UI_BASE_URL in
 * env config), so tests must not change it.
 */
export class GeneralSettingsPage extends BasePage {
  readonly generalSettings = new SavableCard(this.page, 'GENERAL SETTINGS');
  readonly socialLinks = new SavableCard(this.page, 'SOCIAL LINKS');

  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${FUNDRAISING_WEBSITE_ROUTES.general}`);
    await this.generalSettings.card.waitFor({ state: 'visible' });
  }

  async getWebsiteUrlSlug(): Promise<string> {
    return this.generalSettings.field('Website url:').inputValue();
  }

  async setSocialLink(network: 'Facebook:' | 'X (formerly Twitter):' | 'LinkedIn:' | 'Instagram:' | 'YouTube:' | 'Vimeo:' | 'Snapchat:' | 'TikTok:', url: string) {
    await this.socialLinks.field(network).fill(url);
    await this.socialLinks.save();
  }

  async getSocialLink(network: 'Facebook:' | 'X (formerly Twitter):' | 'LinkedIn:' | 'Instagram:' | 'YouTube:' | 'Vimeo:' | 'Snapchat:' | 'TikTok:'): Promise<string> {
    return this.socialLinks.field(network).inputValue();
  }

  async setShowMinBidForLiveLots(checked: boolean) {
    const checkbox = this.generalSettings.field('Show Min Bid For Live Lots:');
    if ((await checkbox.isChecked()) === checked) {
      return; // no change to save
    }
    await checkbox.setChecked(checked);
    await this.generalSettings.save();
  }

  async isShowMinBidForLiveLotsChecked(): Promise<boolean> {
    return this.generalSettings.field('Show Min Bid For Live Lots:').isChecked();
  }
}
