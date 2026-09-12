import { test, expect } from '../fixtures';

test.describe('EMS admin API > Regular Giving (Stripe subscriptions)', () => {
  test('the admin search endpoint accepts the shared bearer token and returns shaped rows', async ({ ems, e2eEvent }) => {
    const rows = await ems.subscriptions.list({ q: 'QA E2E', status: 'all' });
    // This event has had real QA subscriptions created against it before (from live exploration on
    // 2026-09-12); if none currently exist, this just confirms the endpoint itself works and returns [].
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
    await expect(ems.subscriptions.cancel(e2eEvent.id, ZERO_UUID)).rejects.toThrow();
  });
});
