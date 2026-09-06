import { test, expect } from '../fixtures';
import { Totals } from '../../src/api/types';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// These tests move the E2E event's totals, so they run serially and each one
// cancels what it created — the suite leaves totals exactly where it found them.
test.describe.serial('EMS check-in API > donations (create / cancel)', () => {
  const donationRaised = (t: Totals) => t.donation.raised;

  test('a $10 donation is accepted, counts toward totals immediately, and cancelling reverses it', async ({ ems, lite, e2eEvent }) => {
    const pledgeId = (await lite.pledgeItem(e2eEvent.id)).id;
    const before = await ems.reports.totals(e2eEvent.id);

    const result = await ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId, amount: 1000 });
    expect(result).toMatchObject({ code: 'accepted', amount: 1000, pledgeId });
    expect(result.id).toMatch(UUID);

    try {
      await expect
        .poll(async () => donationRaised(await ems.reports.totals(e2eEvent.id)) - donationRaised(before), { timeout: 15_000 })
        .toBe(1000);
      const rows = await ems.reports.donations(e2eEvent.id);
      expect(rows).toContainEqual(expect.objectContaining({ totalValue: 1000, qty: 1 }));
    } finally {
      const cancelled = await ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, result.id);
      expect(cancelled).toMatchObject({ id: result.id, amount: 1000, guestId: e2eEvent.apiGuestId });
    }

    await expect
      .poll(async () => donationRaised(await ems.reports.totals(e2eEvent.id)) - donationRaised(before), { timeout: 15_000 })
      .toBe(0);
    const after = await ems.reports.totals(e2eEvent.id);
    expect(after.donation.totalDonation).toBe(before.donation.totalDonation);
    expect(after.totalRaised).toBe(before.totalRaised);
  });

  test('cancelling the same donation twice is idempotent', async ({ ems, lite, e2eEvent }) => {
    const pledgeId = (await lite.pledgeItem(e2eEvent.id)).id;
    const result = await ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId, amount: 1000 });
    expect(result.code).toBe('accepted');

    const first = await ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, result.id);
    const second = await ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, result.id);
    expect(first.id).toBe(result.id);
    expect(second.id).toBe(result.id);
  });
});

test.describe('EMS check-in API > donations (validation)', () => {
  test('a zero amount is rejected with code invalid_amount (HTTP 200)', async ({ ems, lite, e2eEvent }) => {
    const pledgeId = (await lite.pledgeItem(e2eEvent.id)).id;
    const result = await ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId, amount: 0 });
    expect(result).toMatchObject({ code: 'invalid_amount', amount: 0 });
  });

  test('an unknown pledge id returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(
      ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId: ZERO_UUID, amount: 1000 }),
    ).rejects.toMatchObject({ status: 404, code: 'notFound' });
  });

  test('cancelling an unknown donation returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID)).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });
});
