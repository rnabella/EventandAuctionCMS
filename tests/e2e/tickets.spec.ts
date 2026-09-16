import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { TicketsPage } from '../../src/pages/lite/tickets/TicketsPage';
import { TicketBookingPage } from '../../src/pages/lite/tickets/TicketBookingPage';
import { TicketConfirmationPage } from '../../src/pages/lite/tickets/TicketConfirmationPage';
import { MyTicketsPage } from '../../src/pages/lite/tickets/MyTicketsPage';

// Serial within the file; `npm run test:e2e` runs lite-e2e with --workers=1.
test.describe.serial('Lite UI > Tickets (donor journey, verified via the EMS API)', () => {
  test('a new donor buys one $20 ticket with a test card, and the EMS API records the paid ticket purchase', async ({
    page,
    ems,
    lite,
    e2eEvent,
  }) => {
    test.setTimeout(240_000);
    const donor = newE2EDonor();
    const ticket = (await lite.tickets(e2eEvent.id)).find((t) => t.id === e2eEvent.ticketId);
    expect(ticket, 'fixture ticket must be on sale (api-setup ensures this)').toBeDefined();
    const price = ticket!.price; // 2000
    const before = await ems.reports.totals(e2eEvent.id);

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
    await new OptInsPage(page).continueWithDefaults();

    // 3. Booking wizard: summary → details → assign later → fees off → pay exactly $20.00
    const booking = new TicketBookingPage(page);
    await booking.waitForOrderSummary(ticket!.title);
    await booking.continueFromOrderSummary();
    await booking.continueFromBookingDetails();
    await booking.assignTicketsLater();
    await booking.setFees(false);
    await booking.expectTotal(price);
    await booking.payWithSavedCard();
    await new TicketConfirmationPage(page).expectSuccess(price);

    // 4. Verify through the EMS API
    await expect
      .poll(
        async () =>
          (await ems.guests.paymentTransactions(e2eEvent.id, guestId))
            .filter((p) => p.status === 'paid')
            .reduce((sum, p) => sum + p.amount, 0),
        { timeout: 15_000 },
      )
      .toBe(price);
    const [payment] = await ems.guests.paymentTransactions(e2eEvent.id, guestId);
    expect(payment).toMatchObject({ status: 'paid', processor: 'stripe', amount: price, cardLast4: '4242', currency: 'USD' });
    expect(payment.paymentTransactions).toContainEqual(
      expect.objectContaining({
        recordType: 'ticket_purchase',
        itemId: e2eEvent.ticketId,
        amountPaid: price,
        paymentStatus: 'paid',
        itemCount: 1,
      }),
    );
    expect(payment.paymentTransactions).toContainEqual(expect.objectContaining({ recordType: 'ticket_booking_fee', amountPaid: 0 }));

    const outstanding = await ems.guests.checkout(e2eEvent.id, guestId);
    expect(outstanding.ticketPurchases).toEqual([]);
    expect(outstanding.grandTotal).toBe(0);

    // Tickets are not part of the fundraising totals — pin that fact.
    const after = await ems.reports.totals(e2eEvent.id);
    expect(after.totalRaised).toBe(before.totalRaised);

    // 5. The donor sees the ticket under My Tickets
    const myTickets = new MyTicketsPage(page);
    await myTickets.goto();
    await myTickets.expectAssignedTickets(1);
  });
});
