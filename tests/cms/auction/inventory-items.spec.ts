import { test, expect } from '@playwright/test';
import { DonorsPage } from '../../../src/pages/cms/auction/DonorsPage';
import { InventoryItemsPage } from '../../../src/pages/cms/auction/InventoryItemsPage';
import { env } from '../../../src/config/env';

test.describe('CMS Auction Items > Inventory Items', () => {
  test('creates an inventory item for a donor and it appears in the list (checklist: Upload your inventory auction items)', async ({
    page,
  }) => {
    // A donor is a required field on an inventory item, so create one inline
    // rather than depending on donors.spec.ts having already run.
    const donorsPage = new DonorsPage(page);
    await donorsPage.goto(env.testEventId);
    const donorName = 'QA Automation Test Donor';
    await donorsPage.createDonor(donorName);

    const inventoryItemsPage = new InventoryItemsPage(page);
    await inventoryItemsPage.goto(env.testEventId);

    const title = 'QA Automation Test Inventory Item';
    const itemId = await inventoryItemsPage.createInventoryItem(title, donorName, 100);
    expect(itemId).toMatch(/^[0-9a-f-]{36}$/);

    await inventoryItemsPage.goto(env.testEventId);
    expect(await inventoryItemsPage.hasInventoryItem(title)).toBe(true);
  });
});
