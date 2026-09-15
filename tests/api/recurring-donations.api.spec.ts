import { test, expect } from '../fixtures';

test.describe('EMS admin API > Regular Giving (Stripe subscriptions)', () => {
  test('the admin search endpoint accepts the shared bearer token and returns shaped rows', async ({ ems }) => {
    const rows = await ems.subscriptions.list({ q: 'QA E2E', status: 'all' });
    // Verified live 2026-09-16: this event has 11+ real QA subscriptions (cancelled rows persist in
    // the list per this slice's own documented eventual-consistency gotcha), so asserting a non-empty
    // result is meaningful here rather than vacuous.
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toMatchObject({
        eventId: expect.any(String),
        guestId: expect.any(String),
        subscriptionId: expect.stringMatching(/^sub_/),
        subscriptionStatus: expect.any(String),
        recurringInterval: expect.any(String),
        recurringIntervalCount: expect.any(Number),
        amount: expect.any(Number),
      });
    }
  });

  test('cancelling an unknown subscription record id 404s', async ({ ems, e2eEvent }) => {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    // Verified live 2026-09-16 against this exact id: HTTP 404, EMS's generic shape (not Stripe's
    // passthrough error — see EmsApi.ts's subscriptions.cancel docblock: the generic message is what
    // appears for a record id that was never valid to begin with, vs. Stripe's own "No such
    // subscription" text on a retry against a real, previously-active record).
    await expect(ems.subscriptions.cancel(e2eEvent.id, ZERO_UUID)).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });
});
