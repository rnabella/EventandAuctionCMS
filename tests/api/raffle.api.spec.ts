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

  test('api-setup leaves the fixture raffle sellable for at least a month', async ({ ems, e2eEvent }) => {
    const raffle = await ems.gliRaffles.get(e2eEvent.id, e2eEvent.raffleId);
    const DAY_MS = 86_400_000;
    expect(raffle).toMatchObject({ id: e2eEvent.raffleId, status: 'active', hidden: false, price: 1000 });
    expect(raffle.numberAvailable).toBeGreaterThanOrEqual(100);
    expect((Date.parse(raffle.endTime) - Date.now()) / DAY_MS).toBeGreaterThan(30);
  });
});

test.describe('EMS check-in API > GLI raffle purchases — access control and validation', () => {
  test('creating a purchase with an unregistered device id is rejected (forbidden), not accepted', async ({ ems, e2eEvent }) => {
    // Documents a real, deliberate constraint of this endpoint: unlike checkin.purchaseTickets/bid/
    // buyNowPurchase, a GLI raffle purchase can only be originated by a device the event's check-in
    // system recognises. There is no discoverable API to obtain a valid one (rsu-devices is POST-only,
    // undocumented, out of scope) — so this suite can never exercise the "real" create path directly;
    // only the Lite UI (tests/e2e/raffle.spec.ts) can. This test exists so a future change in that
    // behavior (e.g. it starts silently succeeding) fails loudly here instead of nowhere.
    //
    // Verified live 2026-09-11: this is a real HTTP 403 (`{"code":"forbidden","message":"Forbidden
    // access","extra":""}`), NOT an HTTP-200-with-in-band-code response as initially assumed —
    // HttpClient.parse() throws ApiError for any non-2xx status regardless of body shape, so this
    // asserts the rejection (and its carried `code`) rather than a returned body.
    await expect(
      ems.http.post(`checkin/v1/events/${e2eEvent.id}/guests/${e2eEvent.apiGuestId}/gliRafflePurchases`, {
        gliRaffleId: e2eEvent.raffleId,
        bundleId: null,
        count: 1,
        deviceId: '00000000-0000-0000-0000-000000000001',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });
  });

  test('cancelling an unknown purchase id 404s', async ({ ems, e2eEvent }) => {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    // Verified live 2026-09-11: a real HTTP 404 with `code: "notFound"`, not merely "some rejection".
    await expect(ems.checkin.cancelGliRafflePurchase(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID)).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });
});
