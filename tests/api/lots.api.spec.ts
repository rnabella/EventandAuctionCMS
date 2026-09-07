import { test, expect } from '../fixtures';
import type { LiteApi } from '../../src/api/LiteApi';

test.describe('EMS iBid API > fixture lots', () => {
  test('all three fixture lots exist with the right bid mode', async ({ ems, e2eEvent }) => {
    const silent = await ems.lots.get(e2eEvent.id, e2eEvent.lotId);
    expect(silent).toMatchObject({ id: e2eEvent.lotId, status: 'active', hidden: false, minStartPrice: 2500 });

    const buyNow = await ems.lots.get(e2eEvent.id, e2eEvent.buyNowLotId);
    expect(buyNow).toMatchObject({ id: e2eEvent.buyNowLotId, status: 'active', hidden: false, bidMode: 'buy_now', buyNowPrice: 5000 });

    const sealed = await ems.lots.get(e2eEvent.id, e2eEvent.sealedLotId);
    expect(sealed).toMatchObject({ id: e2eEvent.sealedLotId, status: 'active', hidden: false, bidMode: 'sealed', minStartPrice: 2500 });
  });
});

test.describe('EMS iBid API > fixture lot health', () => {
  test('api-setup leaves all three fixture lots sellable', async ({ ems, e2eEvent }) => {
    for (const [id, expectedMode] of [
      [e2eEvent.lotId, undefined],
      [e2eEvent.buyNowLotId, 'buy_now'],
      [e2eEvent.sealedLotId, 'sealed'],
    ] as const) {
      const lot = await ems.lots.get(e2eEvent.id, id);
      expect(lot.status).toBe('active');
      expect(lot.hidden).toBe(false);
      expect(lot.numberAvailable).toBeGreaterThanOrEqual(1);
      if (expectedMode) expect(lot.bidMode).toBe(expectedMode);
    }
  });
});

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

async function liteLot(lite: LiteApi, eventId: string, lotId: string) {
  const lots = await lite.lots(eventId);
  const lot = lots.find((l) => l.id === lotId);
  if (!lot) throw new Error(`Lot ${lotId} not found in the public lots list for event ${eventId}`);
  return lot;
}

test.describe.serial('EMS check-in API > bids (place / cancel / outbid)', () => {
  test('a below-minimum first bid is rejected in-band; the minimum bid is accepted, then cancelled', async ({ ems, lite, e2eEvent }) => {
    const low = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 500 });
    expect(low.code).toBe('below_minimum');

    const result = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 2500 });
    try {
      expect(result).toMatchObject({ code: 'accepted', lotId: e2eEvent.lotId, amount: 2500, topAmount: 2500 });
      await expect.poll(async () => (await liteLot(lite, e2eEvent.id, e2eEvent.lotId)).topBidAmount, { timeout: 15_000 }).toBe(2500);
      const row = (await ems.reports.bids(e2eEvent.id)).find((r) => r.id === e2eEvent.lotId);
      expect(row).toMatchObject({ bids: 1, totalValue: 2500 });
    } finally {
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, result.id);
    }

    await expect.poll(async () => (await liteLot(lite, e2eEvent.id, e2eEvent.lotId)).bidCount, { timeout: 15_000 }).toBe(0);
  });

  test('a below-increase second bid is rejected; a valid outbid becomes the new top', async ({ ems, lite, e2eEvent }) => {
    const first = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 2500 });
    try {
      const tooLow = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 3500 });
      expect(tooLow.code).toBe('below_increase');

      const outbid = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 5000 });
      try {
        expect(outbid).toMatchObject({ code: 'accepted', topAmount: 5000 });
        await expect.poll(async () => (await liteLot(lite, e2eEvent.id, e2eEvent.lotId)).topBidAmount, { timeout: 15_000 }).toBe(5000);
      } finally {
        await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, outbid.id);
      }
    } finally {
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, first.id);
    }
    await expect.poll(async () => (await liteLot(lite, e2eEvent.id, e2eEvent.lotId)).bidCount, { timeout: 15_000 }).toBe(0);
  });
});

test.describe('EMS check-in API > bids (validation)', () => {
  test('an unknown lot id returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: ZERO_UUID, amount: 2500 })).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });

  test('cancelling an unknown bid id is idempotent (HTTP 200, not 404)', async ({ ems, e2eEvent }) => {
    const cancelled = await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID);
    expect(cancelled).toBeNull();
  });
});
