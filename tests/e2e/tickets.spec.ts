import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { TicketsPage } from '../../src/pages/lite/tickets/TicketsPage';
import { TicketBookingPage } from '../../src/pages/lite/tickets/TicketBookingPage';

// Serial within the file; `npm run test:e2e` runs lite-e2e with --workers=1.
test.describe.serial('Lite UI > Tickets (donor journey, verified via the EMS API)', () => {
  test('a new donor selects the $20 ticket, registers, and reaches Review & Payment with a $20.00 total', async ({
    page,
    lite,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();
    const ticket = (await lite.tickets(e2eEvent.id)).find((t) => t.id === e2eEvent.ticketId);
    expect(ticket, 'fixture ticket must be on sale (api-setup ensures this)').toBeDefined();
    const price = ticket!.price; // 2000

    // 1. Pick one ticket
    const tickets = new TicketsPage(page);
    await tickets.goto();
    await tickets.addTicket(ticket!.title, 1);
    await tickets.buyTickets();

    // 2. Register (the order travels with the registration)
    await new LiteSignInPage(page).continueWithEmail(donor.email);
    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    expect(guestId).toMatch(/^[0-9a-f-]{36}$/);
    await new OptInsPage(page).continueWithDefaults();

    // 3. Booking wizard up to the payment step
    const booking = new TicketBookingPage(page);
    await booking.waitForOrderSummary(ticket!.title);
    await booking.continueFromOrderSummary();
    await booking.continueFromBookingDetails();
    await booking.assignTicketsLater();
    await booking.setFees(false);
    await booking.expectTotal(price);
  });
});
