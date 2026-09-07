import { EmsApi } from './EmsApi';
import type { IBidLotUpdate } from './types';

/** A lot needs at least this many days left on its sale window to be worth using in a run. */
export const LOT_MIN_DAYS_LEFT = 30;
const DAY_MS = 86_400_000;
const FAR_FUTURE_END_TIME = '2030-12-31T23:00:00.000+00:00';

/**
 * Keeps one fixture lot sellable: active, visible, at least one item available,
 * and far from its sale end. Optional `overrides` re-assert bid-mode-specific
 * fields (e.g. `{ bidMode: 'buy_now', buyNowPrice: 5000 }`) in case a previous
 * run's exploration or a manual CMS edit drifted them. Mirrors
 * `ticketFixture.ts`'s `ensureTicketSellable` — same "strip created/updated,
 * send the rest back" write shape (lots have no ticket-style immutable field
 * like `ticketType`, so nothing else needs stripping).
 */
export async function ensureLotSellable(
  ems: EmsApi,
  eventId: string,
  lotId: string,
  overrides: Partial<IBidLotUpdate> = {},
): Promise<void> {
  const lot = await ems.lots.get(eventId, lotId);
  const daysLeft = (Date.parse(lot.endTime) - Date.now()) / DAY_MS;
  const overrideDrifted = (Object.keys(overrides) as Array<keyof IBidLotUpdate>).some((key) => lot[key] !== overrides[key]);

  const needsHealing = lot.status !== 'active' || lot.hidden || lot.numberAvailable < 1 || daysLeft < LOT_MIN_DAYS_LEFT || overrideDrifted;
  if (!needsHealing) return;

  const { created, updated, ...editable } = lot;
  void created;
  void updated;
  await ems.lots.update(eventId, lotId, {
    ...editable,
    status: 'active',
    hidden: false,
    numberAvailable: Math.max(lot.numberAvailable, 1),
    endTime: FAR_FUTURE_END_TIME,
    ...overrides,
  });

  const after = await ems.lots.get(eventId, lotId);
  if (after.status !== 'active' || after.hidden || after.numberAvailable < 1) {
    throw new Error(
      `Lot ${lotId} ("${lot.title}") could not be healed to a sellable state. ` +
        `Check it directly in the CMS: events/${eventId}/lots/edit/?id=${lotId}`,
    );
  }
}
