import { test, expect } from '@playwright/test';
import { GuestsPage } from '../../../src/pages/cms/guests/GuestsPage';
import { TablesPage } from '../../../src/pages/cms/guests/TablesPage';
import { env } from '../../../src/config/env';

/**
 * Guest List and Table Assignment were originally two separate spec files.
 * Both write to the same underlying Guests list (each calls `createGuest`),
 * and running them concurrently is the same lost-update race documented in
 * `tests/cms/ticketing/ticketing-writes.spec.ts` and
 * `tests/cms/auction/campaign-items-writes.spec.ts`. Merged into one file
 * with `describe.serial` so they never run concurrently with each other.
 */
test.describe.serial('CMS Guests > writes (serialized: shared guest list)', () => {
  test('creates a new guest and it appears in the list (checklist: Upload your guest information)', async ({ page }) => {
    const guestsPage = new GuestsPage(page);
    await guestsPage.goto(env.testEventId);

    await guestsPage.createGuest('QA', 'Automation');

    await guestsPage.goto(env.testEventId);
    await expect(page.locator('tr', { hasText: 'Automation' }).first()).toBeVisible();
  });

  test('creates a table and assigns a new guest to it (checklist: Add your guests to their tables)', async ({ page }) => {
    const tablesPage = new TablesPage(page);
    await tablesPage.goto(env.testEventId);

    const tableName = 'QA Automation Test Table';
    const tableLabel = await tablesPage.createTable(tableName, 8);

    await tablesPage.goto(env.testEventId);
    expect(await tablesPage.hasTable(tableName)).toBe(true);

    const guestsPage = new GuestsPage(page);
    await guestsPage.goto(env.testEventId);
    await guestsPage.createGuest('QA', 'TableTest', tableLabel);

    await guestsPage.goto(env.testEventId);
    expect(await guestsPage.hasGuestAtTable('TableTest', tableLabel)).toBe(true);
  });
});
