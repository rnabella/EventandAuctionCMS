import { Page, expect } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { TICKETING_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Tickets" list and ticket-creation form under Ticketing — checklist item
 * "Create your tickets". Each call to createTicket() creates a genuinely new
 * ticket type (there's no "set this field" idempotent save here, unlike the
 * Website Details cards), so repeated runs accumulate multiple ticket rows —
 * expected, per the project's "full CRUD, no restore needed" test data policy.
 */
export class TicketsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    // "CREATE NEW TICKET" is static and visible immediately; existing tickets load
    // via a separate async request afterward (same pitfall as Questions/PromotionCodes).
    await this.page.goto(`events/${eventId}/${TICKETING_ROUTES.tickets}`, { waitUntil: 'networkidle' });
    await this.page.getByRole('button', { name: 'CREATE NEW TICKET' }).waitFor({ state: 'visible' });
  }

  /** The ticket Title field is a TipTap rich-text editor, not a plain input, hence the label-relative lookup. */
  private get titleEditor() {
    return this.page.locator('label:has-text("Title")').first().locator('xpath=following::div[@contenteditable="true"][1]');
  }

  private get priceInput() {
    return this.page.locator('input[name="price"]');
  }

  private get statusCombobox() {
    return this.page.getByRole('combobox').filter({ hasText: /Active|Inactive/ }).first();
  }

  private get saveButton() {
    return this.page.getByRole('button', { name: 'Save', exact: true });
  }

  /** Creates a new ticket via "CREATE NEW TICKET", sets it Active, and saves. Returns the created ticket's id. */
  async createTicket(title: string, price: number): Promise<string> {
    await this.page.getByRole('button', { name: 'CREATE NEW TICKET' }).click();
    await this.titleEditor.waitFor({ state: 'visible' });

    await this.titleEditor.click();
    await this.titleEditor.fill(title);
    await this.priceInput.fill(String(price));

    await this.statusCombobox.click();
    await this.page.getByRole('option', { name: 'Active', exact: true }).click();

    await expect(this.saveButton).toBeEnabled();
    await this.saveButton.click();
    await this.page.waitForURL(/\/tickets\/edit\/\?id=/);

    const url = new URL(this.page.url());
    const id = url.searchParams.get('id');
    if (!id) {
      throw new Error(`Expected a ticket id in the URL after saving, got: ${this.page.url()}`);
    }
    return id;
  }

  private ticketRow(title: string) {
    return this.page.locator('tr', { hasText: title });
  }

  async hasTicketWithTitleAndPrice(title: string, price: number): Promise<boolean> {
    const row = this.ticketRow(title).filter({ hasText: `$ ${price}` });
    return (await row.count()) > 0;
  }

  /** Deletes every ticket with this exact title. Used by the maintenance cleanup, not the regular test suite. */
  async deleteAllWithTitle(title: string): Promise<number> {
    return this.deleteAllTableRowsMatching(title);
  }
}
