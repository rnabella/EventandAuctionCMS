import { test, expect } from '../fixtures';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// These tests move the E2E event's totals, so they run serially and each one
// cancels what it created — the suite leaves totals exactly where it found them.
test.describe.serial('EMS check-in API > donations (create / cancel)', () => {
  // The report accumulates one $10/qty-1 row per e2e/API run and NEVER drops
  // it again — see the note below the `finally` block — so a fixed presence
  // check (`toContainEqual`) would still pass with a stale row left over from
  // a previous run. Count matching rows and assert a delta on creation
  // instead. `allDonations` pages past the report's default 50-row page.
  const matchingRowCount = (rows: { totalValue: number; qty: number }[]) => rows.filter((r) => r.totalValue === 1000 && r.qty === 1).length;

  test('a $10 donation is accepted, counts toward totals immediately, and cancelling reverses it', async ({
    ems,
    lite,
    e2eEvent,
    totalsDelta,
  }) => {
    const pledgeId = (await lite.pledgeItem(e2eEvent.id)).id;
    const totals = await totalsDelta(e2eEvent.id);
    const rowsBefore = matchingRowCount(await ems.reports.allDonations(e2eEvent.id));

    const result = await ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId, amount: 1000 });

    try {
      expect(result).toMatchObject({ code: 'accepted', amount: 1000, pledgeId });
      expect(result.id).toMatch(UUID);

      await totals.expectDelta((t) => t.donation.raised, 1000);
      await expect
        .poll(async () => matchingRowCount(await ems.reports.allDonations(e2eEvent.id)), { timeout: 15_000 })
        .toBe(rowsBefore + 1);
    } finally {
      const cancelled = await ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, result.id);
      expect(cancelled).toMatchObject({ id: result.id, amount: 1000, guestId: e2eEvent.apiGuestId });
    }

    await totals.expectDelta((t) => t.donation.raised, 0);
    // NOT asserted: matchingRowCount returning to rowsBefore. Verified live
    // (2026-09-06) that a cancelled donation's row never disappears from
    // `reports/donation`, no matter how long you poll — see the `status`
    // discovery in `EmsApi.reports.donations()`'s docblock. `reports/totals`
    // reverting (above) is the correct oracle for "cancelling reverses it";
    // the report row itself joins the same permanent accumulation as every
    // other "new row every run" entity in this project (see README).
    const after = await totals.now();
    expect(after.donation.totalDonation).toBe(totals.before.donation.totalDonation);
    // Polled, not a single read: an active (uncancelled) bid elsewhere in the suite transiently
    // counts toward the top-level totalRaised (see EmsApi.checkin.bid's docblock) — a single-shot
    // read here can land mid-bid and see a real but temporary inflation from a concurrent test.
    // `donation.raised`/`totalDonation` above are immune (bids don't touch the donation sub-object),
    // so only this cross-cutting aggregate needs the same poll-until-settled treatment.
    await totals.expectDelta((t) => t.totalRaised, 0);
  });

  test('cancelling the same donation twice is idempotent', async ({ ems, lite, e2eEvent }) => {
    const pledgeId = (await lite.pledgeItem(e2eEvent.id)).id;
    const result = await ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId, amount: 1000 });

    try {
      expect(result.code).toBe('accepted');
      const first = await ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, result.id);
      expect(first.id).toBe(result.id);
    } finally {
      const second = await ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, result.id);
      expect(second.id).toBe(result.id);
    }
  });
});

test.describe('EMS check-in API > donations (validation)', () => {
  test('a zero amount is rejected with code invalid_amount (HTTP 200)', async ({ ems, lite, e2eEvent }) => {
    const pledgeId = (await lite.pledgeItem(e2eEvent.id)).id;
    const result = await ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId, amount: 0 });
    expect(result).toMatchObject({ code: 'invalid_amount', amount: 0 });
  });

  test('an unknown pledge id returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId: ZERO_UUID, amount: 1000 })).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });

  test('cancelling an unknown donation returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID)).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });
});
