import { test, expect } from '@playwright/test';
import { CampaignItemsPage } from '../../../src/pages/cms/auction/CampaignItemsPage';
import { GivergyItemsPage } from '../../../src/pages/cms/auction/GivergyItemsPage';
import { env } from '../../../src/config/env';

/**
 * Campaign Items and Givergy Items were originally two separate spec files.
 * Both write to the same underlying "Campaign Items" (lots) list — creating a
 * new item and adding a Givergy catalog item to the campaign — and running
 * them concurrently is a lost-update race, the same mechanism documented in
 * `tests/cms/ticketing/ticketing-writes.spec.ts`: it only reproduced
 * consistently once accumulated test-data cleanup made these pages fast
 * enough to actually overlap. Merged into one file with `describe.serial` so
 * they never run concurrently with each other.
 */
test.describe.serial('CMS Auction Items > Campaign Items writes (serialized: shared list)', () => {
  test('creates a new auction item and it appears in the active items list (checklist: Upload auction items)', async ({ page }) => {
    const campaignItemsPage = new CampaignItemsPage(page);
    await campaignItemsPage.goto(env.testEventId);

    const title = 'QA Automation Test Auction Item';
    const itemId = await campaignItemsPage.createAuctionItem(title);
    expect(itemId).toMatch(/^[0-9a-f-]{36}$/);

    await campaignItemsPage.goto(env.testEventId);
    expect(await campaignItemsPage.hasActiveItem(title)).toBe(true);
  });

  test('adds a catalog item to the campaign and it appears in Campaign Items (checklist: Add your chosen Givergy Items)', async ({
    page,
  }) => {
    const givergyItemsPage = new GivergyItemsPage(page);
    await givergyItemsPage.goto(env.testEventId);

    const catalogItemTitle = '1 Night stay at 5* spa hotel in London for 2';
    await givergyItemsPage.addCatalogItem(catalogItemTitle);

    const campaignItemsPage = new CampaignItemsPage(page);
    await campaignItemsPage.goto(env.testEventId);
    expect(await campaignItemsPage.hasActiveItem(catalogItemTitle)).toBe(true);
  });
});
