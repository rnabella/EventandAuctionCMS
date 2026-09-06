import { test, expect } from '@playwright/test';
import { SystemNotificationsPage } from '../../../src/pages/cms/notifications/SystemNotificationsPage';
import { env } from '../../../src/config/env';

test.describe('CMS Notifications > Edit System Notifications', () => {
  test('saves the email subject for a system message (checklist: Review & update the default system notifications)', async ({ page }) => {
    const systemNotificationsPage = new SystemNotificationsPage(page);
    await systemNotificationsPage.goto(env.testEventId);
    await systemNotificationsPage.selectSystemMessage('Forgotten Password');

    const testSubject = 'Reset your password (QA Automation)';
    await systemNotificationsPage.setEmailSubject(testSubject);

    await systemNotificationsPage.goto(env.testEventId);
    await systemNotificationsPage.selectSystemMessage('Forgotten Password');
    expect(await systemNotificationsPage.getEmailSubject()).toBe(testSubject);
  });
});
