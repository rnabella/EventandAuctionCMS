import { test, expect } from '@playwright/test';
import { GeneralSettingsPage } from '../../../src/pages/cms/website/GeneralSettingsPage';
import { env } from '../../../src/config/env';

test.describe('CMS Fundraising Website > General Settings', () => {
  let generalSettingsPage: GeneralSettingsPage;

  test.beforeEach(async ({ page }) => {
    generalSettingsPage = new GeneralSettingsPage(page);
    await generalSettingsPage.goto(env.testEventId);
  });

  test('website URL matches the configured Lite UI slug (checklist: Set up your website URL)', async () => {
    const slug = await generalSettingsPage.getWebsiteUrlSlug();
    expect(env.liteUi.baseUrl).toContain(slug);
  });

  test('saves a social link (checklist: Add your social links)', async () => {
    const testUrl = 'https://facebook.com/givergy-qa-automation';
    await generalSettingsPage.setSocialLink('Facebook:', testUrl);

    await generalSettingsPage.goto(env.testEventId);
    expect(await generalSettingsPage.getSocialLink('Facebook:')).toBe(testUrl);
  });

  test('toggles "Show Min Bid For Live Lots" on and it persists', async () => {
    await generalSettingsPage.setShowMinBidForLiveLots(true);

    await generalSettingsPage.goto(env.testEventId);
    expect(await generalSettingsPage.isShowMinBidForLiveLotsChecked()).toBe(true);
  });
});
