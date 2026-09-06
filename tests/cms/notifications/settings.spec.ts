import { test, expect } from '@playwright/test';
import { NotificationSettingsPage } from '../../../src/pages/cms/notifications/NotificationSettingsPage';
import { env } from '../../../src/config/env';

test.describe('CMS Notifications > Settings', () => {
  test('saves the SMS keyword (checklist: Review our recommended communication strategy guide)', async ({ page }) => {
    const notificationSettingsPage = new NotificationSettingsPage(page);
    await notificationSettingsPage.goto(env.testEventId);

    const testKeyword = 'QAAUTO';
    await notificationSettingsPage.setSmsKeyword(testKeyword);

    await notificationSettingsPage.goto(env.testEventId);
    expect(await notificationSettingsPage.getSmsKeyword()).toBe(testKeyword);
  });
});
