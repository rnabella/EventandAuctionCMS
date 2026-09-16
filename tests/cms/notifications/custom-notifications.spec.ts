import { test, expect } from '@playwright/test';
import { CustomNotificationsPage } from '../../../src/pages/cms/notifications/CustomNotificationsPage';
import { env } from '../../../src/config/env';

test.describe('CMS Notifications > Send Custom Notification', () => {
  test('drafts a custom notification and it appears under Drafts (checklist: Draft, schedule & test your custom notifications)', async ({
    page,
  }) => {
    const customNotificationsPage = new CustomNotificationsPage(page);
    await customNotificationsPage.gotoCampaigns(env.testEventId);

    await customNotificationsPage.createDraft('All Guests', 'Please register');

    await customNotificationsPage.gotoDraftsTab(env.testEventId);
    expect(await customNotificationsPage.hasDraftWithMailingList('All')).toBe(true);
  });
});
