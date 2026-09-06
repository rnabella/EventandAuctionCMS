import { test } from '@playwright/test';
import { TicketsPage } from '../../src/pages/cms/ticketing/TicketsPage';
import { QuestionsPage } from '../../src/pages/cms/ticketing/QuestionsPage';
import { PromotionCodesPage } from '../../src/pages/cms/ticketing/PromotionCodesPage';
import { CampaignItemsPage } from '../../src/pages/cms/auction/CampaignItemsPage';
import { InventoryItemsPage } from '../../src/pages/cms/auction/InventoryItemsPage';
import { DonorsPage } from '../../src/pages/cms/auction/DonorsPage';
import { GuestsPage } from '../../src/pages/cms/guests/GuestsPage';
import { TablesPage } from '../../src/pages/cms/guests/TablesPage';
import { CustomNotificationsPage } from '../../src/pages/cms/notifications/CustomNotificationsPage';
import { env } from '../../src/config/env';

/**
 * Not part of the regular suite (`npm test`) — run explicitly via `npm run cleanup`.
 *
 * The CRUD tests in tests/cms/** create genuinely new rows every run by design
 * (see README's "shared test data" section): a "QA Automation Test Ticket",
 * "QA Automation Test Auction Item", etc. accumulate on the shared Integration
 * event over time until list-heavy pages get slow enough to threaten the test
 * timeout — confirmed for Tickets, Auction Items, Inventory Items, Donors,
 * Guests, and Promotion Codes so far. This deletes the accumulated rows for
 * every entity type this suite creates, always via that entity's own delete
 * icon/button + its confirmation dialog — never a bulk "DELETE ALL" action,
 * so it can't remove anything this suite didn't itself create.
 *
 * Every test below targets a distinct list/resource, so they're safe to run
 * fully parallel like the rest of this project's suites (no describe.serial
 * needed) — confirmed Tables delete cleanly even while guests are still
 * assigned to them, so there's no meaningful Guests-before-Tables ordering
 * requirement either.
 */

/**
 * Some lists (Inventory Items observed so far) occasionally under-report how
 * many rows still match right after a deletion — a single deletion-method pass
 * can stop early even with rows left. A fresh `goto()` between passes reliably
 * clears whatever in-page state causes that, so this just re-runs the deletion
 * pass against a clean reload until a pass deletes nothing.
 */
async function deleteAllInPasses(deleteOnePass: () => Promise<number>, maxPasses = 10): Promise<number> {
  let total = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const deleted = await deleteOnePass();
    total += deleted;
    if (deleted === 0) break;
  }
  return total;
}

test.describe('Maintenance > Cleanup accumulated test data', () => {
  // Bulk-deleting dozens of accumulated rows one confirm-dialog round-trip at a
  // time legitimately takes longer than the regular suite's per-test timeout,
  // especially on a first cleanup run after a long gap. Scoped to this describe
  // block only — the regular suite's timeout is untouched.
  test.describe.configure({ timeout: 300_000 });

  test('deletes QA Automation test tickets', async ({ page }) => {
    const ticketsPage = new TicketsPage(page);
    const deleted = await deleteAllInPasses(async () => {
      await ticketsPage.goto(env.testEventId);
      return ticketsPage.deleteAllWithTitle('QA Automation Test Ticket');
    });
    console.log(`Deleted ${deleted} ticket(s)`);
  });

  test('deletes QA Automation auction items (including added Givergy catalog items)', async ({ page }) => {
    const campaignItemsPage = new CampaignItemsPage(page);
    const deletedCreated = await deleteAllInPasses(async () => {
      await campaignItemsPage.goto(env.testEventId);
      return campaignItemsPage.deleteAllWithTitle('QA Automation Test Auction Item');
    });
    console.log(`Deleted ${deletedCreated} created auction item(s)`);

    const deletedCatalog = await deleteAllInPasses(async () => {
      await campaignItemsPage.goto(env.testEventId);
      return campaignItemsPage.deleteAllWithTitle('1 Night stay at 5* spa hotel in London for 2');
    });
    console.log(`Deleted ${deletedCatalog} added Givergy catalog item(s)`);
  });

  test('deletes QA Automation inventory items', async ({ page }) => {
    const inventoryItemsPage = new InventoryItemsPage(page);
    const deleted = await deleteAllInPasses(async () => {
      await inventoryItemsPage.goto(env.testEventId);
      return inventoryItemsPage.deleteAllWithTitle('QA Automation Test Inventory Item');
    });
    console.log(`Deleted ${deleted} inventory item(s)`);
  });

  test('deletes QA Automation donors', async ({ page }) => {
    const donorsPage = new DonorsPage(page);
    const deleted = await deleteAllInPasses(async () => {
      await donorsPage.goto(env.testEventId);
      return donorsPage.deleteAllWithName('QA Automation Test Donor');
    });
    console.log(`Deleted ${deleted} donor(s)`);
  });

  test('deletes QA Automation custom notifications drafts', async ({ page }) => {
    const customNotificationsPage = new CustomNotificationsPage(page);
    const deleted = await deleteAllInPasses(async () => {
      await customNotificationsPage.gotoDraftsTab(env.testEventId);
      return customNotificationsPage.deleteAllDrafts();
    });
    console.log(`Deleted ${deleted} draft(s)`);
  });

  test('deletes QA Automation ticket questions', async ({ page }) => {
    const questionsPage = new QuestionsPage(page);
    const deleted = await deleteAllInPasses(async () => {
      await questionsPage.goto(env.testEventId);
      return questionsPage.deleteAllWithText('Do you have any dietary requirements? (QA Automation)');
    });
    console.log(`Deleted ${deleted} question(s)`);
  });

  test('deletes QA Automation promotion codes', async ({ page }) => {
    const promotionCodesPage = new PromotionCodesPage(page);
    const deleted = await deleteAllInPasses(async () => {
      await promotionCodesPage.goto(env.testEventId);
      return promotionCodesPage.deleteAllWithCode('QAAUTO10');
    });
    console.log(`Deleted ${deleted} promotion code(s)`);
  });

  test('deletes QA Automation guests', async ({ page }) => {
    const guestsPage = new GuestsPage(page);
    const deleted = await deleteAllInPasses(async () => {
      await guestsPage.goto(env.testEventId);
      // Both createGuest() calls in the regular suite use first name "QA"
      // ("QA Automation" and "QA TableTest"), so this covers both.
      return guestsPage.deleteAllWithFirstName('QA');
    });
    console.log(`Deleted ${deleted} guest(s)`);
  });

  test('deletes QA Automation tables', async ({ page }) => {
    const tablesPage = new TablesPage(page);
    const deleted = await deleteAllInPasses(async () => {
      await tablesPage.goto(env.testEventId);
      return tablesPage.deleteAllWithName('QA Automation Test Table');
    });
    console.log(`Deleted ${deleted} table(s)`);
  });
});
