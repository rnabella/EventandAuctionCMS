import { test, expect } from '@playwright/test';
import { ChecklistPage } from '../../../src/pages/cms/ChecklistPage';
import { env } from '../../../src/config/env';
import { CHECKLIST_SECTIONS, CHECKLIST_TOTAL_ITEM_COUNT } from '../../../src/data/checklistData';

test.describe('CMS Event Checklist', () => {
  let checklistPage: ChecklistPage;

  test.beforeEach(async ({ page }) => {
    checklistPage = new ChecklistPage(page);
    await checklistPage.goto(env.testEventId);
  });

  test('renders every expected section heading', { tag: '@smoke' }, async () => {
    const sectionNames = await checklistPage.getSectionNames();
    expect(sectionNames).toEqual(Object.keys(CHECKLIST_SECTIONS));
  });

  test('renders every expected item under each section, with a working Help link', async () => {
    for (const items of Object.values(CHECKLIST_SECTIONS)) {
      for (const title of items) {
        await expect(checklistPage.item(title)).toBeVisible();
        // Help links point to different help domains per topic (help.givergy.com,
        // givergy.my.site.com, ...), so only the link's shape is asserted here.
        await expect(checklistPage.helpLinkFor(title)).toHaveAttribute('href', /^https:\/\//);
      }
    }
  });

  test('reports a completion percentage consistent with checked items', async () => {
    const percentage = await checklistPage.getCompletionPercentage();
    expect(percentage).toBeGreaterThanOrEqual(0);
    expect(percentage).toBeLessThanOrEqual(100);

    let checkedCount = 0;
    for (const items of Object.values(CHECKLIST_SECTIONS)) {
      for (const title of items) {
        if (await checklistPage.isItemChecked(title)) checkedCount += 1;
      }
    }
    const expectedPercentage = Math.round((checkedCount / CHECKLIST_TOTAL_ITEM_COUNT) * 100);
    expect(percentage).toBe(expectedPercentage);
  });

  test('navigating an item via its arrow opens the corresponding CMS section', async ({ page }) => {
    await checklistPage.openItem('Upload auction items');
    await expect(page).toHaveURL(/\/lots\/eventLots\/$/);
  });
});
