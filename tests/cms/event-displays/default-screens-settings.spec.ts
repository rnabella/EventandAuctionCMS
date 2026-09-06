import { test, expect } from '@playwright/test';
import { EventDisplaySettingsPage } from '../../../src/pages/cms/EventDisplaySettingsPage';
import { env } from '../../../src/config/env';

const SCREEN_NAME = 'Event Display | Silent Auction Event Display and Carousel';

// Both tests select the same screen and read/write through the same page-level
// Save button, so run serially to avoid any read/write overlap.
test.describe.serial('CMS Event Displays > Select Screen', () => {
  let eventDisplaySettingsPage: EventDisplaySettingsPage;

  test.beforeEach(async ({ page }) => {
    eventDisplaySettingsPage = new EventDisplaySettingsPage(page);
    await eventDisplaySettingsPage.goto(env.testEventId);
    await eventDisplaySettingsPage.selectScreen(SCREEN_NAME);
  });

  test('saves the theme colour (checklist: Create & Design your Event Display Screens)', async () => {
    const testColour = '#2437ff';
    await eventDisplaySettingsPage.setThemeColour(testColour);

    await eventDisplaySettingsPage.goto(env.testEventId);
    await eventDisplaySettingsPage.selectScreen(SCREEN_NAME);
    expect(await eventDisplaySettingsPage.getThemeColour()).toBe(testColour);
  });

  test('exposes a shareable preview link for the onsite AV team (checklist: Share with your onsite AV team to display)', async () => {
    const href = await eventDisplaySettingsPage.getPreviewLinkHref();
    expect(href).toContain('/lb/?');
    expect(href).toContain(`eventId=${env.testEventId}`);
    expect(href).toContain('screenId=');
  });
});
