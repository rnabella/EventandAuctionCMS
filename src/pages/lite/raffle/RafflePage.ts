import { LiteBasePage } from '../LiteBasePage';

/**
 * `?controller=gliRaffles&action=showRaffle&id=<displayNumber>` (the raffle's
 * short display number, not its UUID) — a single GLI raffle's detail/purchase
 * page. Each purchasable option (the "3 for $25" bundle and the "1 ticket for
 * $10" individual entry) renders as a `.addOrRemoveItem` block with an
 * `Add`/`Remove` button pair (real `title` attributes, no accessible name).
 * One page-level `<button name="buyNow">Buy Tickets</button>` submits the
 * current selection across all options.
 */
export class RafflePage extends LiteBasePage {
  readonly buyTicketsButton = this.page.locator('button[name="buyNow"]');

  async goto(displayNumber: string): Promise<void> {
    await this.gotoLite('gliRaffles', 'showRaffle', { id: displayNumber });
    await this.buyTicketsButton.waitFor();
  }

  private option(label: string) {
    return this.page.locator('.addOrRemoveItem').filter({ hasText: label });
  }

  /** Adds `count` to the "1 ticket for $10" individual-entry option (the only option this suite purchases). */
  async addIndividualEntry(count: number): Promise<void> {
    const addButton = this.option('1 ticket for $10').getByTitle('Add');
    for (let i = 0; i < count; i++) {
      await addButton.click();
    }
  }

  async buyTickets(): Promise<void> {
    await this.buyTicketsButton.click();
  }
}
