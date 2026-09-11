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
 */
export async function ensureRaffleSellable(ems: EmsApi, eventId: string, raffleId: string): Promise<IBidGliRaffle> {
  const raffle = await ems.gliRaffles.get(eventId, raffleId);
  if (isSellable(raffle)) {
    return raffle;
  }
  const { created, updated, ...editable } = raffle;
  void created; void updated;
  await ems.gliRaffles.update(eventId, raffleId, {
    ...editable,
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
        `Fix it in the CMS: events/${eventId}/prizeDraws/edit/?id=${raffleId} (or wherever GLI raffles are edited — confirm the real CMS path during implementation).`,
    );
  }
  return after;
}
