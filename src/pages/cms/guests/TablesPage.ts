import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { GUESTS_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Table Plan" pages under Guests — a prerequisite for the checklist item
 * "Add your guests to their tables" (a guest can only be assigned to a table
 * that already exists). "Number" defaults empty but must be unique per table,
 * same collision risk as Auction Item's "Item Number" — given a fresh value
 * per run.
 */
export class TablesPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${GUESTS_ROUTES.tables}`, { waitUntil: 'networkidle' });
    await this.page.getByRole('button', { name: 'CREATE NEW TABLE' }).waitFor({ state: 'visible' });
  }

  /** Creates a new table with a fresh, unique number. Returns "[number] name", the label used to select it elsewhere. */
  async createTable(name: string, seatCount: number): Promise<string> {
    await this.page.getByRole('button', { name: 'CREATE NEW TABLE' }).click();
    await this.page.waitForURL(/\/tables\/create\/$/);

    const number = String(Date.now() % 100_000);
    await this.page.locator('label:has-text("Name")').first().locator('xpath=following::input[1]').fill(name);
    await this.page.locator('label:has-text("Number")').first().locator('xpath=following::input[1]').fill(number);
    await this.page.locator('label:has-text("Seat Count")').first().locator('xpath=following::input[1]').fill(String(seatCount));

    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    await this.page.waitForURL(/\/tables\/index\/$/);

    return `[${number}] ${name}`;
  }

  // The tables list renders as cards (Name/Number/Guests Assigned + action
  // buttons), not an HTML table — unlike the Guests list, `tr` never matches here.
  async hasTable(name: string): Promise<boolean> {
    return (await this.page.getByText(name, { exact: true }).count()) > 0;
  }

  /** Deletes every table with this exact name. Used by the maintenance cleanup, not the regular test suite. */
  async deleteAllWithName(name: string): Promise<number> {
    return this.deleteAllCardsMatching(name, { confirmButtonName: 'DELETE' });
  }
}
