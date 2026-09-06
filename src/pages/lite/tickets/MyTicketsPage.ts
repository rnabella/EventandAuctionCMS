import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';

/** `?controller=myBids&action=tickets` — "My Tickets" (ticket management for a signed-in donor). */
export class MyTicketsPage extends LiteBasePage {
  async goto(): Promise<void> {
    await this.gotoLite('myBids', 'tickets');
    await expect(this.page.locator('main')).toContainText('My Tickets');
  }

  /** e.g. "Assigned Tickets ( 1 )" — the DOM pads the parentheses with spaces. */
  async expectAssignedTickets(count: number): Promise<void> {
    await expect(this.page.locator('main')).toContainText(new RegExp(`Assigned Tickets \\(\\s*${count}\\s*\\)`), { timeout: 30_000 });
  }
}
