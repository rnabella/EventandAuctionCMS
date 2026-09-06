import { EmsApi } from './EmsApi';
import { IBidTicket } from './types';

/** Below this the fixture is topped back up to 1000 (each e2e run consumes 1). */
export const SELLABLE_MIN_AVAILABLE = 100;
/** Below this many days of sale window left, the sale end is pushed out again. */
export const SELLABLE_MIN_DAYS_LEFT = 30;
const RESTOCK_TO = 1000;
const FAR_FUTURE_END = '2030-12-31T23:00:00.000+00:00';
const DAY_MS = 86_400_000;

function isSellable(t: IBidTicket): boolean {
  const daysLeft = (Date.parse(t.endTime) - Date.now()) / DAY_MS;
  return t.status === 'active' && !t.hidden && t.numberAvailable >= SELLABLE_MIN_AVAILABLE && daysLeft >= SELLABLE_MIN_DAYS_LEFT;
}

/**
 * Idempotently makes the pre-created fixture ticket purchasable on the public
 * site. The CMS "Create ticket" flow leaves `numberAvailable: 0` ("Sold Out")
 * and a 24 h sale window, and every e2e run consumes one ticket — so without
 * this, the ticket journey would silently start failing. Reads the ticket via
 * the iBid API and, only when needed, writes it back with stock restored to
 * 1000, the sale end far in the future, status active and not hidden. The
 * update payload excludes `created`, `updated`, and `ticketType` — the iBid
 * API rejects all three (the server owns the first two; the last is
 * immutable once the ticket has purchases, which it now does). Throws an
 * actionable error if the write did not take.
 */
export async function ensureTicketSellable(ems: EmsApi, eventId: string, ticketId: string): Promise<IBidTicket> {
  const ticket = await ems.tickets.get(eventId, ticketId);
  if (isSellable(ticket)) {
    return ticket;
  }
  const { created, updated, ticketType, ...editable } = ticket;
  void created; void updated; void ticketType; // server-owned / immutable — excluded from the payload
  await ems.tickets.update(eventId, ticketId, {
    ...editable,
    status: 'active',
    hidden: false,
    numberAvailable: Math.max(ticket.numberAvailable, RESTOCK_TO),
    endTime: FAR_FUTURE_END,
  });
  const after = await ems.tickets.get(eventId, ticketId);
  if (!isSellable(after)) {
    throw new Error(
      `Fixture ticket ${ticketId} is still not sellable after an iBid update ` +
        `(status=${after.status} hidden=${after.hidden} numberAvailable=${after.numberAvailable} endTime=${after.endTime}). ` +
        `Fix it in the CMS: events/${eventId}/tickets/edit/?id=${ticketId} (Limit ≥ ${RESTOCK_TO}, Sale End far future).`,
    );
  }
  return after;
}
