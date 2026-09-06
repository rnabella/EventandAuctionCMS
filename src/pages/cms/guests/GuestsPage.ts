import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { GUESTS_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Guest List" pages under Guests — checklist items "Upload your guest
 * information" (CSV bulk upload is deferred, same file-upload boundary as
 * elsewhere; individual creation via "ADD GUEST" is covered instead) and
 * "Add your guests to their tables" (the create-guest form has its own
 * "Table" field, an Autocomplete — assigning it there satisfies the checklist
 * item directly, no separate Table Assignments flow needed).
 *
 * The Table field's input carries `role="combobox"` directly (like Auction
 * Items' Donor field), and its wrapping `MuiAutocomplete-root` has
 * `aria-label="Table"` — scoped that way rather than by label proximity,
 * since a plain `input[role="combobox"][value="Choose"]` CSS selector would
 * also match the unrelated "Data Opt In Status" field (same default value).
 */
export class GuestsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${GUESTS_ROUTES.guestList}`, { waitUntil: 'networkidle' });
    await this.page.getByRole('button', { name: 'ADD GUEST' }).waitFor({ state: 'visible' });
  }

  private get tableCombobox() {
    return this.page.locator('[aria-label="Table"] input[role="combobox"]');
  }

  /**
   * Same pitfall as Auction Items' Donor Autocomplete (InventoryItemsPage):
   * it searches once per `.fill()`, not continuously, so a table created
   * moments earlier (e.g. by this same test, immediately before) can be
   * missed if the backend hasn't indexed it yet. Re-searches a few times
   * rather than trusting a single attempt.
   */
  private async selectTable(tableLabel: string) {
    const option = this.page.getByRole('option', { name: tableLabel, exact: true }).first();
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.tableCombobox.click();
      await this.tableCombobox.fill(tableLabel);
      if (await option.isVisible({ timeout: 4_000 }).catch(() => false)) {
        // The dropdown can re-render (e.g. a background refetch) between this
        // visibility check and the click landing, detaching the option mid-click.
        // Treat that as "try the search again" rather than a hard failure.
        const clicked = await option
          .click({ timeout: 4_000 })
          .then(() => true)
          .catch(() => false);
        if (clicked) {
          return;
        }
      }
    }
    throw new Error(`Table "${tableLabel}" never appeared in the search results after ${maxAttempts} attempts`);
  }

  /**
   * Creates a new guest, optionally assigning them to a table (pass the label
   * returned by `TablesPage.createTable`, e.g. "[41316] QA Automation Test Table").
   * The guest list rows don't carry an id attribute, so persistence is verified
   * by re-reading the list afterward (see `hasGuestAtTable`) rather than by id.
   */
  async createGuest(firstName: string, lastName: string, tableLabel?: string) {
    await this.page.getByRole('button', { name: 'ADD GUEST' }).click();
    await this.page.waitForURL(/\/guests\/create\/$/);

    await this.page.locator('input[name="firstName"]').fill(firstName);
    await this.page.locator('input[name="lastName"]').fill(lastName);

    if (tableLabel) {
      await this.selectTable(tableLabel);
    }

    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    await this.page.waitForURL(/\/guests\/details\/$/);
  }

  /**
   * The Guest List's "Table" column shows the table's raw number, not its
   * name — confirmed by inspecting rows in a "NOT READY" state (the name
   * presumably resolves once some async processing finishes; the number is
   * available immediately). Pass the label `TablesPage.createTable` returns
   * (e.g. "[79314] QA Automation Test Table") — this checks for the number,
   * not the name, since that's what's actually reliably displayed.
   */
  async hasGuestAtTable(lastName: string, tableLabel: string): Promise<boolean> {
    const tableNumberMatch = tableLabel.match(/^\[(\d+)\]/);
    const tableIdentifier = tableNumberMatch ? tableNumberMatch[1] : tableLabel;
    return (await this.page.locator('tr', { hasText: lastName }).filter({ hasText: tableIdentifier }).count()) > 0;
  }

  /** Deletes every guest with this exact first name. Used by the maintenance cleanup, not the regular test suite. */
  async deleteAllWithFirstName(firstName: string): Promise<number> {
    return this.deleteAllTableRowsMatching(firstName);
  }
}
