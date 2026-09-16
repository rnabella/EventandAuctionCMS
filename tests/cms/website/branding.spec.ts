import { test, expect } from '@playwright/test';
import { BrandingPage } from '../../../src/pages/cms/website/BrandingPage';
import { env } from '../../../src/config/env';

test.describe('CMS Fundraising Website > Branding', () => {
  test('saves the theme colour (checklist: Add your color scheme and logos)', { tag: '@smoke' }, async ({ page }) => {
    const brandingPage = new BrandingPage(page);
    await brandingPage.goto(env.testEventId);

    const testColour = '#2437ff';
    await brandingPage.setThemeColour(testColour);

    await brandingPage.goto(env.testEventId);
    expect(await brandingPage.getThemeColour()).toBe(testColour);
  });
});
