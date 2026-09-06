import { test, expect } from '@playwright/test';
import { SponsorsPage } from '../../../src/pages/cms/website/SponsorsPage';
import { env } from '../../../src/config/env';

test.describe('CMS Fundraising Website > Sponsors', () => {
  test('saves the "show after every N items" display setting (checklist: Add sponsor highlights)', async ({ page }) => {
    const sponsorsPage = new SponsorsPage(page);
    await sponsorsPage.goto(env.testEventId);

    await sponsorsPage.setShowAfterEveryNumberOfItems(7);

    await sponsorsPage.goto(env.testEventId);
    expect(await sponsorsPage.getShowAfterEveryNumberOfItems()).toBe('7');
  });
});
