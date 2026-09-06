import { test, expect } from '@playwright/test';
import { EventPagePage } from '../../../src/pages/cms/website/EventPagePage';
import { env } from '../../../src/config/env';

// Both tests below save through the same "DETAILS" card/endpoint (Event Name and
// Event Address are saved together), so they must not run concurrently against
// each other — a race would let one test's save clobber the other's.
test.describe.serial('CMS Fundraising Website > Event Page', () => {
  let eventPagePage: EventPagePage;

  test.beforeEach(async ({ page }) => {
    eventPagePage = new EventPagePage(page);
    await eventPagePage.goto(env.testEventId);
  });

  test('saves the event name (checklist: Set up your dedicated Event Page)', async () => {
    const testName = 'Givergy QA Automation Gala';
    await eventPagePage.setEventName(testName);

    await eventPagePage.goto(env.testEventId);
    expect(await eventPagePage.getEventName()).toBe(testName);
  });

  test('saves the event address (checklist: Set up your dedicated Event Page)', async () => {
    const testAddress = '1 Automation Way, Test City, TC 00000';
    await eventPagePage.setEventAddress(testAddress);

    await eventPagePage.goto(env.testEventId);
    expect(await eventPagePage.getEventAddress()).toBe(testAddress);
  });
});
