import { test, expect } from '../fixtures';
import { SELLABLE_MIN_AVAILABLE, SELLABLE_MIN_DAYS_LEFT } from '../../src/api/ticketFixture';
import { ApiError } from '../../src/api/http';

const DAY_MS = 86_400_000;

test.describe('EMS iBid API > fixture ticket', () => {
  test('api-setup leaves the fixture ticket sellable for at least a month', async ({ ems, e2eEvent }) => {
    const ticket = await ems.tickets.get(e2eEvent.id, e2eEvent.ticketId);
    expect(ticket).toMatchObject({ id: e2eEvent.ticketId, status: 'active', hidden: false, price: 2000 });
    expect(ticket.numberAvailable).toBeGreaterThanOrEqual(SELLABLE_MIN_AVAILABLE);
    expect((Date.parse(ticket.endTime) - Date.now()) / DAY_MS).toBeGreaterThan(SELLABLE_MIN_DAYS_LEFT);
  });
});

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** sc-98155: cancel answers 500 but does cancel. Swallow exactly that; anything else is a real failure. */
async function cancelTicketPurchaseTolerating500(ems: import('../../src/api/EmsApi').EmsApi, eventId: string, guestId: string, purchaseId: string) {
  try {
    await ems.checkin.cancelTicketPurchase(eventId, guestId, purchaseId);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 500)) throw e;
  }
}

// Reserves and cancels real ticket purchases for the QA guest — serial, self-cleaning.
test.describe.serial('EMS check-in API > ticket purchases (reserve / cancel)', () => {
  test('reserving one ticket puts a $20 line in the guest basket; cancelling removes it', async ({ ems, e2eEvent }) => {
    const before = await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId);
    const linesBefore = before.ticketPurchases.filter((t) => t.itemId === e2eEvent.ticketId).length;

    const [result] = await ems.checkin.purchaseTickets(e2eEvent.id, e2eEvent.apiGuestId, { ticketId: e2eEvent.ticketId, count: 1 });
    try {
      expect(result).toMatchObject({ code: 'accepted', ticketId: e2eEvent.ticketId, amount: 2000, count: 1 });
      await expect
        .poll(async () => {
          const c = await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId);
          return c.ticketPurchases.filter((t) => t.itemId === e2eEvent.ticketId).length;
        }, { timeout: 15_000 })
        .toBe(linesBefore + 1);
      const during = await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId);
      expect(during.ticketPurchases).toContainEqual(
        expect.objectContaining({ itemId: e2eEvent.ticketId, purchaseId: result.id, itemCount: 1, totalAmount: 2000 }),
      );
      expect(during.grandTotal - before.grandTotal).toBe(2000);
    } finally {
      await cancelTicketPurchaseTolerating500(ems, e2eEvent.id, e2eEvent.apiGuestId, result.id);
    }

    await expect
      .poll(async () => {
        const c = await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId);
        return c.ticketPurchases.filter((t) => t.itemId === e2eEvent.ticketId).length;
      }, { timeout: 15_000 })
      .toBe(linesBefore);
    expect((await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId)).grandTotal).toBe(before.grandTotal);
  });

  test('cancelling a ticket purchase should return 200 (known bug sc-98155: returns 500)', async ({ ems, e2eEvent }) => {
    test.fail(true, 'sc-98155 — ticketPurchases/cancel returns HTTP 500 although the purchase is cancelled. Remove this annotation when fixed.');
    const [result] = await ems.checkin.purchaseTickets(e2eEvent.id, e2eEvent.apiGuestId, { ticketId: e2eEvent.ticketId, count: 1 });
    expect(result.code).toBe('accepted');
    try {
      await ems.checkin.cancelTicketPurchase(e2eEvent.id, e2eEvent.apiGuestId, result.id); // throws ApiError(500) today
    } finally {
      await cancelTicketPurchaseTolerating500(ems, e2eEvent.id, e2eEvent.apiGuestId, result.id);
    }
  });
});

test.describe('EMS check-in API > ticket purchases (validation)', () => {
  test('count 0 is rejected with 422', async ({ ems, e2eEvent }) => {
    const error = await ems.checkin
      .purchaseTickets(e2eEvent.id, e2eEvent.apiGuestId, { ticketId: e2eEvent.ticketId, count: 0 })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422 });
    expect((error as ApiError).body).toEqual(expect.objectContaining({ errors: expect.arrayContaining([expect.stringMatching(/count/)]) }));
  });

  test('an unknown ticket id returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(
      ems.checkin.purchaseTickets(e2eEvent.id, e2eEvent.apiGuestId, { ticketId: ZERO_UUID, count: 1 }),
    ).rejects.toMatchObject({ status: 404, code: 'notFound' });
  });

  test('cancelling an unknown ticket purchase returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(ems.checkin.cancelTicketPurchase(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID)).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });
});
