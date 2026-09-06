import { expect, Locator } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';
import { usd } from '../../../utils/money';

/**
 * `?controller=tickets&action=booking` — the 4-step "Tickets Booking" accordion:
 * 1 Order Summary → 2 Booking details → 3 Assign tickets → 4 Review & Payment.
 * Never reload this page: the wizard resets to Step 1, and the unpaid
 * reservation behind it expires after ~10–15 minutes.
 */
export class TicketBookingPage extends LiteBasePage {
  private region(step: number, name: string): Locator {
    return this.page.getByRole('region', { name: `Step ${step} - ${name}` });
  }
  readonly orderSummary = this.region(1, 'Order Summary');
  readonly bookingDetails = this.region(2, 'Booking details');
  readonly assignTickets = this.region(3, 'Assign tickets');
  readonly reviewAndPayment = this.region(4, 'Review & Payment');

  async waitForOrderSummary(ticketTitle: string): Promise<void> {
    await expect(this.orderSummary).toContainText(ticketTitle, { timeout: 30_000 });
  }

  /** Step 1's Continue is a sibling of its region, not inside it — it is the first "Continue" on the page. */
  async continueFromOrderSummary(): Promise<void> {
    await this.page.getByRole('button', { name: 'Continue', exact: true }).first().click();
    await this.bookingDetails.getByRole('textbox', { name: 'First Name' }).waitFor();
  }

  /** Step 2 is prefilled from registration; Continue saves the booking details. */
  async continueFromBookingDetails(): Promise<void> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/ticket-purchases\/[^/]+\/booking-details/.test(r.url()),
        { timeout: 30_000 },
      ),
      this.bookingDetails.getByRole('button', { name: 'Continue', exact: true }).click(),
    ]);
    const body = (await response.json()) as { code: string; message: string };
    if (body.code !== 'ok') {
      throw new Error(`Saving booking details failed: ${body.code} — ${body.message}`);
    }
  }

  /**
   * Step 3: choose "No, I'll assign all tickets myself" (reveals the assignment
   * form) and take the "Add later" shortcut, which books the ticket to the
   * purchaser without sending anyone a ticket email.
   */
  async assignTicketsLater(): Promise<void> {
    await this.assignTickets
      .locator('label[for$="share-public-link-no"]')
      .filter({ hasText: /assign all tickets myself/ })
      .click();
    const addLater = this.assignTickets.getByRole('link', { name: 'Add later' });
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/ticket-bookings\/[^/]+/.test(r.url()),
        { timeout: 30_000 },
      ),
      addLater.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string };
    if (body.code !== 'ok') {
      throw new Error(`Ticket booking failed: ${body.code} — ${body.message}`);
    }
    await this.reviewAndPayment.getByRole('button', { name: /Pay with Card/ }).waitFor({ timeout: 30_000 });
  }

  /**
   * Step 4 has two fee toggles — the $4.00 ticket booking fee and the $0.95
   * processing fee — both hidden inputs inside `label.switch`. Scoped to this
   * step because Step 1 has its own `applyPremiums` toggle.
   *
   * Deviations from the brief (recorded in the Task 4 report):
   * 1. Both switches render unchecked with a blank amount cell for a moment,
   *    then asynchronously settle to the fee's real default (observed as
   *    either on or off, apparently randomly, across runs) a few hundred ms
   *    later. Reading `isChecked()` during that blank window can conclude no
   *    click is needed just before the value flips, leaving the fee stuck on
   *    with a stale Total for the rest of the test. Each toggle now waits for
   *    its amount cell to populate before deciding whether to click.
   * 2. The checkbox's own `checked` property flips synchronously on click, so
   *    `toBeChecked()` alone is not a reliable signal that the recompute has
   *    happened — the app updates the displayed fee amount (and therefore the
   *    Total) asynchronously. Each toggle's own amount cell — not just its
   *    checkbox — is asserted before moving to the next one. (Turning the
   *    booking fee on for the first time also defaults the processing fee on
   *    as a side effect, observed live; asserting per-toggle amounts sidesteps
   *    that too.)
   */
  async setFees(on: boolean): Promise<void> {
    const rows: Record<string, string> = {
      applyTicketBookingFees: '.ticket-booking-fee-amount',
      applyPremiums: '.item-fee-amount',
    };
    for (const [name, amountSelector] of Object.entries(rows)) {
      const input = this.reviewAndPayment.locator(`input[name="${name}"]`);
      const amount = this.reviewAndPayment.locator(amountSelector);
      await expect(amount).not.toHaveText('', { timeout: 10_000 });
      if ((await input.isChecked()) !== on) {
        await this.reviewAndPayment.locator(`label.switch:has(input[name="${name}"])`).click();
      }
      await expect(input).toBeChecked({ checked: on });
      if (!on) {
        await expect(amount).toHaveText(`$${usd(0)}`, { timeout: 10_000 });
      }
    }
  }

  /** e.g. "Total $20.00" once both fees are off. */
  async expectTotal(amountCents: number): Promise<void> {
    await expect(this.reviewAndPayment).toContainText(`Total $${usd(amountCents)}`);
  }
}
