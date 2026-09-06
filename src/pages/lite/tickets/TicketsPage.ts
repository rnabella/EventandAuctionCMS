import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';

/**
 * `?controller=tickets` — "Tickets". Each ticket row has "-" / quantity / "+"
 * controls; "Buy Tickets" enables once at least one ticket is selected. An
 * anonymous visitor is sent to sign-in (the order is carried along and
 * completed right after registration).
 */
export class TicketsPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Tickets', exact: true });
  readonly buyTicketsButton = this.page.getByRole('button', { name: 'Buy Tickets' });

  async goto(): Promise<void> {
    await this.gotoLite('tickets');
    await this.heading.waitFor();
  }

  /** Clicks "+" `quantity` times and confirms the selection summary lists the ticket. */
  async addTicket(title: string, quantity = 1): Promise<void> {
    const plus = this.page.getByRole('button', { name: '+', exact: true }).first();
    for (let i = 0; i < quantity; i++) {
      await plus.click();
    }
    await expect(this.page.locator('main')).toContainText(`x${quantity} ${title}`);
    await expect(this.buyTicketsButton).toBeEnabled();
  }

  async buyTickets(): Promise<void> {
    await this.buyTicketsButton.click();
  }
}
