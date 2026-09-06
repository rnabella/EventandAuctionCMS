import { test, expect } from '@playwright/test';
import { NavigationMenuPage } from '../../../src/pages/cms/website/NavigationMenuPage';
import { env } from '../../../src/config/env';

test.describe('CMS Fundraising Website > Navigation Menu', () => {
  test('renders the default header and footer menu structure (checklist: Configure your website menu)', async ({ page }) => {
    const navigationMenuPage = new NavigationMenuPage(page);
    await navigationMenuPage.goto(env.testEventId);

    for (const label of ['Home', 'More Info', 'Sponsor & Attend', 'Bid, Browse, and Support', 'Account']) {
      expect(await navigationMenuPage.hasHeaderMenuItem(label), `header menu should show "${label}"`).toBe(true);
    }

    for (const label of ['Help', 'Account', 'The Event', 'Terms & Privacy']) {
      expect(await navigationMenuPage.hasFooterMenuItem(label), `footer menu should show "${label}"`).toBe(true);
    }
  });
});
