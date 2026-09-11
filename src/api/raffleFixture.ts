import { EmsApi } from './EmsApi';
import { IBidGliRaffle } from './types';

/** Below this the fixture is topped back up to 1000 (each e2e run consumes 1 individual entry). */
export const SELLABLE_MIN_AVAILABLE = 100;
/** Below this many days of sale window left, the sale end is pushed out again. */
export const SELLABLE_MIN_DAYS_LEFT = 30;
const RESTOCK_TO = 1000;
const FAR_FUTURE_END = '2030-12-31T23:00:00.000+00:00';
const DAY_MS = 86_400_000;

function isSellable(r: IBidGliRaffle): boolean {
  const daysLeft = (Date.parse(r.endTime) - Date.now()) / DAY_MS;
  return r.status === 'active' && !r.hidden && r.numberAvailable >= SELLABLE_MIN_AVAILABLE && daysLeft >= SELLABLE_MIN_DAYS_LEFT;
}

/**
 * Idempotently keeps the pre-created fixture raffle purchasable on the public
 * site, the same role ensureTicketSellable/ensureLotSellable play for their
 * fixtures. numberAvailable is the raffle's declared individual-entry stock
 * (permanently reduced by every real purchase, cancelled or not — see
 * GliRaffleItemsReportRow's docblock), so without this the raffle journey
 * would eventually start failing exactly like an un-healed ticket would.
 * Only the top-level individual-entry stock is healed; the "3 for $25" bundle
 * is out of scope (this suite never purchases it — see the plan's Global
 * Constraints).
 *
 * Unlike ensureTicketSellable/ensureLotSellable, this does NOT echo the full
 * record back minus a couple of excluded fields. Verified live 2026-09-11
 * against the real fixture raffle (which already has real purchases against
 * it): the gli-raffles iBid endpoint only accepts PATCH (POST 405s with
 * `Allow: GET, HEAD, OPTIONS, PATCH`), and PATCH here is a genuine partial
 * update — sending the ticket/lot-style "full record minus created/updated"
 * payload 500s (`{"code":"Internal Server Error","message":"Unknown
 * problem"}`), while sending only the fields actually changing succeeds. So
 * no field needs excluding the way ticketFixture excludes `ticketType` or
 * lotFixture excludes `startPrice` — the fix instead is to never send more
 * than the four fields below.
 */
export async function ensureRaffleSellable(ems: EmsApi, eventId: string, raffleId: string): Promise<IBidGliRaffle> {
  const raffle = await ems.gliRaffles.get(eventId, raffleId);
  if (isSellable(raffle)) {
    return raffle;
  }
  await ems.gliRaffles.update(eventId, raffleId, {
    status: 'active',
    hidden: false,
    numberAvailable: Math.max(raffle.numberAvailable, RESTOCK_TO),
    endTime: FAR_FUTURE_END,
  });
  const after = await ems.gliRaffles.get(eventId, raffleId);
  if (!isSellable(after)) {
    throw new Error(
      `Fixture raffle ${raffleId} is still not sellable after an iBid update ` +
        `(status=${after.status} hidden=${after.hidden} numberAvailable=${after.numberAvailable} endTime=${after.endTime}). ` +
        `Fix it in the CMS: events/${eventId}/gliRaffles/edit/?id=${raffleId} (the "Raffles" section).`,
    );
  }
  return after;
}
