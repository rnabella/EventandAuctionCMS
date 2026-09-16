import { test, expect } from '@playwright/test';
import { ContentPage } from '../../../src/pages/cms/website/ContentPage';
import { env } from '../../../src/config/env';

test.describe('CMS Fundraising Website > Content', () => {
  test('saves the homepage video URL (checklist: Add your homepage text, homepage image or video and additional info text)', async ({
    page,
  }) => {
    const contentPage = new ContentPage(page);
    await contentPage.goto(env.testEventId);

    const testVideoUrl = 'https://www.youtube.com/watch?v=givergy-qa-automation';
    await contentPage.setHomePageVideoUrl(testVideoUrl);

    await contentPage.goto(env.testEventId);
    expect(await contentPage.getHomePageVideoUrl()).toBe(testVideoUrl);
  });
});
