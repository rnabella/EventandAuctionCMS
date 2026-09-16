import { test, expect } from '@playwright/test';
import { NotificationSettingsPage } from '../../../src/pages/cms/notifications/NotificationSettingsPage';
import { env } from '../../../src/config/env';

test.describe('CMS Notifications > Settings', () => {
  test('saves the SMS keyword (checklist: Review our recommended communication strategy guide)', async ({ page }) => {
    const notificationSettingsPage = new NotificationSettingsPage(page);
    await notificationSettingsPage.goto(env.testEventId);

    // SMS keywords are globally unique across every event in the environment (verified live
    // 2026-09-16: 'QAAUTO' 400s with "A different event already uses this SMS keyword" — almost
    // certainly claimed by the original checklist test event before TEST_EVENT_ID was repointed
    // to this fresher one). Namespaced to this specific event so it can't collide again.
    const testKeyword = 'QAAUTOSMOKE0915';
    await notificationSettingsPage.setSmsKeyword(testKeyword);

    await notificationSettingsPage.goto(env.testEventId);
    expect(await notificationSettingsPage.getSmsKeyword()).toBe(testKeyword);
  });
});
