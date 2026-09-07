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
