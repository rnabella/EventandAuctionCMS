import { EmsApi } from './EmsApi';
import type { IBidLot, IBidLotUpdate } from './types';

/** A lot needs at least this many days left on its sale window to be worth using in a run. */
export const LOT_MIN_DAYS_LEFT = 30;
const DAY_MS = 86_400_000;
const FAR_FUTURE_END_TIME = '2030-12-31T23:00:00.000+00:00';

/**
 * A lot is sellable when it's active, visible, has at least one item
 * available, is far enough from its sale end, and — when the caller supplied
 * bid-mode-specific overrides (e.g. `{ bidMode: 'buy_now', buyNowPrice: 5000 }`)
 * — those overrides actually match the lot's current values. Used both to
 * decide whether healing is needed and, after a healing write, to verify it
 * actually took, exactly as `ticketFixture.ts`'s `isSellable` is reused on
 * both sides of its write.
 */
function isSellable(lot: IBidLot, overrides: Partial<IBidLotUpdate>): boolean {
  const daysLeft = (Date.parse(lot.endTime) - Date.now()) / DAY_MS;
  const overrideDrifted = (Object.keys(overrides) as Array<keyof IBidLotUpdate>).some((key) => lot[key] !== overrides[key]);
  return lot.status === 'active' && !lot.hidden && lot.numberAvailable >= 1 && daysLeft >= LOT_MIN_DAYS_LEFT && !overrideDrifted;
}

/**
 * Keeps one fixture lot sellable: active, visible, at least one item available,
 * and far from its sale end. Optional `overrides` re-assert bid-mode-specific
 * fields (e.g. `{ bidMode: 'buy_now', buyNowPrice: 5000 }`) in case a previous
 * run's exploration or a manual CMS edit drifted them. Mirrors
 * `ticketFixture.ts`'s `ensureTicketSellable` — same "strip created/updated,
 * send the rest back" write shape, and the same one sellability check reused
 * before and after the write. Also strips `startPrice`, lots' own
 * ticketType-shaped immutable field: the iBid API rejects it once the lot has
 * any bids, which a completed buy-now purchase counts as (see
 * `IBidLotUpdate`).
 */
export async function ensureLotSellable(
  ems: EmsApi,
  eventId: string,
  lotId: string,
  overrides: Partial<IBidLotUpdate> = {},
): Promise<void> {
  const lot = await ems.lots.get(eventId, lotId);
  if (isSellable(lot, overrides)) return;

  const { created, updated, startPrice, ...editable } = lot;
  void created;
  void updated;
  void startPrice;
  await ems.lots.update(eventId, lotId, {
    ...editable,
    status: 'active',
    hidden: false,
    numberAvailable: Math.max(lot.numberAvailable, 1),
    endTime: FAR_FUTURE_END_TIME,
    ...overrides,
  });

  const after = await ems.lots.get(eventId, lotId);
  if (!isSellable(after, overrides)) {
    throw new Error(
      `Lot ${lotId} ("${lot.title}") could not be healed to a sellable state. ` +
        `Check it directly in the CMS: events/${eventId}/lots/edit/?id=${lotId}`,
    );
  }
}

/**
 * Fails fast if any of the given fixture lots already carry a stray bid.
 * Unlike donations/tickets, bid tests have no per-guest listing to scope
 * their assertions to — they assert absolute lot-aggregate values (e.g.
 * `{ bids: 1, totalValue: 2500 }`) via `reports.bids`. If a previous run left
 * an unfinished bid on a fixture lot (e.g. an e2e journey whose
 * `waitForResponse` threw after the bid POST already succeeded, skipping its
 * own cleanup), every subsequent run's absolute assertions fail with a
 * confusing mismatch and no indication why. Checking here, once per run,
 * turns that into a clear, actionable failure instead. Only the silent and
 * sealed lots use this report's notion of "bids" — the buy-now lot's
 * purchases aren't bids, and its stock-management is a separate concern
 * `ensureLotSellable` already handles.
 */
export async function assertNoStrayBids(ems: EmsApi, eventId: string, lotIds: readonly string[]): Promise<void> {
  const rows = await ems.reports.bids(eventId);
  for (const lotId of lotIds) {
    const row = rows.find((r) => r.id === lotId);
    if (row && row.bids > 0) {
      throw new Error(
        `Lot ${lotId} has ${row.bids} stray bid(s) left over (totalValue ${row.totalValue}), likely from a ` +
          `previous e2e run that failed mid-journey before it could cancel its own bid. ` +
          `Check it directly in the CMS: events/${eventId}/lots/edit/?id=${lotId}`,
      );
    }
  }
}
