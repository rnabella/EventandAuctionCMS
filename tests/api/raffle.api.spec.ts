import { test, expect } from '../fixtures';

test.describe('EMS iBid API > fixture raffle', () => {
  test('the fixture raffle is on sale: active, $10/entry, in stock, far-future sale end', async ({ ems, e2eEvent }) => {
    const raffle = await ems.gliRaffles.get(e2eEvent.id, e2eEvent.raffleId);
    expect(raffle).toMatchObject({ id: e2eEvent.raffleId, status: 'active', hidden: false, price: 1000 });
    expect(raffle.numberAvailable).toBeGreaterThanOrEqual(1);
    expect(Date.parse(raffle.endTime)).toBeGreaterThan(Date.now());
  });

  test('the fixture raffle is listed on the public site with the same price and a bundle', async ({ lite, e2eEvent }) => {
    const raffle = await lite.gliRaffle(e2eEvent.id, e2eEvent.raffleId);
    expect(raffle.cachedGliRaffle).toMatchObject({ id: e2eEvent.raffleId, status: 'active', hidden: false, price: 1000 });
    expect(raffle.numberLeft).toBeGreaterThanOrEqual(1);
    expect(raffle.gliBundleList.length).toBeGreaterThanOrEqual(1);
  });
});
