import { test, expect } from '@playwright/test';
import { TicketDetailsPage } from '../../../src/pages/cms/ticketing/TicketDetailsPage';
import { env } from '../../../src/config/env';

test.describe('CMS Ticketing > Details', () => {
  test('renders the default ticket details template (checklist: Update the ticket details)', async ({ page }) => {
    const ticketDetailsPage = new TicketDetailsPage(page);
    await ticketDetailsPage.goto(env.testEventId);

    const text = await ticketDetailsPage.getDescriptionText();
    for (const placeholder of ['{{eventName}}', '{{ticketingDate}}', '{{venueDetails}}']) {
      expect(text, `expected template to contain ${placeholder}`).toContain(placeholder);
    }
  });
});
