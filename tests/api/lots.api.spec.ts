import { test, expect } from '../fixtures';

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
