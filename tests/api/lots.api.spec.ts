import { test, expect } from '../fixtures';
import type { LiteApi } from '../../src/api/LiteApi';
import type { GuestCheckout } from '../../src/api/types';

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
  test('api-setup leaves all three fixture lots sellable', { tag: '@smoke' }, async ({ ems, e2eEvent }) => {
    for (const [id, expectedMode] of [
      [e2eEvent.lotId, undefined],
      [e2eEvent.buyNowLotId, 'buy_now'],
      [e2eEvent.sealedLotId, 'sealed'],
    ] as const) {
      const lot = await ems.lots.get(e2eEvent.id, id);
      expect(lot.status).toBe('active');
      expect(lot.hidden).toBe(false);
      expect(lot.numberAvailable).toBeGreaterThanOrEqual(1);
      // eslint-disable-next-line playwright/no-conditional-expect -- deliberate: not every lot here has a mode to assert.
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

test.describe.serial('EMS check-in API > bids (place / cancel / outbid / sealed masking)', () => {
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

  test('a sealed lot masks only the bidder name on the public site; bid count and amount fields become a count echo instead, unlike a silent lot which shows the real values', async ({
    ems,
    lite,
    e2eEvent,
  }) => {
    const sealedBid = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.sealedLotId, amount: 2500 });
    const silentBid = await ems.checkin.bid(e2eEvent.id, e2eEvent.apiGuestId, { lotId: e2eEvent.lotId, amount: 2500 });
    try {
      expect(sealedBid.code).toBe('accepted');
      expect(silentBid.code).toBe('accepted');
      // The check-in response itself masks a sealed lot's top amount, even to the bidder who just placed it.
      expect(sealedBid.topAmount).toBe(0);
      expect(silentBid.topAmount).toBe(2500);

      await expect
        .poll(async () => (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.sealedLotId)?.bidCount, { timeout: 15_000 })
        .toBe(1);
      const sealedLot = (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.sealedLotId)!;
      expect(sealedLot.topBidName).toBe('Sealed Bid Item');
      expect(sealedLot.bidCount).toBe(1);
      expect(sealedLot.topBidAmountFormatted).toBe('1 Bid Received');
      // Sealed lots repurpose this normally-cents field into a bid-count echo once any bid exists — not a masked-to-zero amount.
      expect(sealedLot.topBidAmount).toBe(1);

      const silentLot = (await lite.lots(e2eEvent.id)).find((l) => l.id === e2eEvent.lotId)!;
      expect(silentLot.topBidAmount).toBe(2500);
      expect(silentLot.bidCount).toBe(1);

      // The admin-facing report still shows the real value for a sealed lot — sealing only hides it from the public site.
      const sealedRow = (await ems.reports.bids(e2eEvent.id)).find((r) => r.id === e2eEvent.sealedLotId);
      expect(sealedRow).toMatchObject({ bids: 1, totalValue: 2500 });
    } finally {
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, sealedBid.id);
      await ems.checkin.cancelBid(e2eEvent.id, e2eEvent.apiGuestId, silentBid.id);
    }

    await expect.poll(async () => (await liteLot(lite, e2eEvent.id, e2eEvent.sealedLotId)).bidCount, { timeout: 15_000 }).toBe(0);
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

function checkoutBuyNowTotal(checkout: GuestCheckout, lotId: string): number {
  return checkout.buyNowPurchases.filter((p) => p.itemId === lotId).reduce((sum, p) => sum + p.totalAmount, 0);
}

test.describe.serial('EMS check-in API > buy-now purchases', () => {
  test('purchasing puts a $50 line in the guest basket; cancelling removes it', async ({ ems, e2eEvent }) => {
    const before = await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId);
    const beforeTotal = checkoutBuyNowTotal(before, e2eEvent.buyNowLotId);

    const result = await ems.checkin.buyNowPurchase(e2eEvent.id, e2eEvent.apiGuestId, { buyNowId: e2eEvent.buyNowLotId, count: 1 });
    try {
      expect(result).toMatchObject({ code: 'accepted', buyNowId: e2eEvent.buyNowLotId, amount: 5000, count: 1 });
      await expect
        .poll(async () => checkoutBuyNowTotal(await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId), e2eEvent.buyNowLotId), {
          timeout: 15_000,
        })
        .toBe(beforeTotal + 5000);
    } finally {
      await ems.checkin.cancelBuyNowPurchase(e2eEvent.id, e2eEvent.apiGuestId, result.id);
    }

    await expect
      .poll(async () => checkoutBuyNowTotal(await ems.guests.checkout(e2eEvent.id, e2eEvent.apiGuestId), e2eEvent.buyNowLotId), {
        timeout: 15_000,
      })
      .toBe(beforeTotal);
  });
});

test.describe('EMS check-in API > buy-now purchases (validation)', () => {
  test('an unknown buy-now lot id returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(ems.checkin.buyNowPurchase(e2eEvent.id, e2eEvent.apiGuestId, { buyNowId: ZERO_UUID, count: 1 })).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });

  test('cancelling an unknown buy-now purchase id is idempotent (HTTP 200, not 404)', async ({ ems, e2eEvent }) => {
    const cancelled = await ems.checkin.cancelBuyNowPurchase(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID);
    expect(cancelled).toBeNull();
  });
});
