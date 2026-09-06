import { test, expect } from '../fixtures';

test.describe('Lite public API > E2E event', () => {
  test('the event accepts card payments via Stripe in USD', async ({ lite, e2eEvent }) => {
    const event = await lite.event(e2eEvent.id);
    expect(event).toMatchObject({
      id: e2eEvent.id,
      currencyCode: 'USD',
      paymentEnabled: true,
      paymentProcessor: 'stripe',
      pledgeEnabled: true,
      pledgeOnLite: true,
    });
  });

  test('the donation item is active with a $10 preset and no custom amount', async ({ lite, e2eEvent }) => {
    const pledge = await lite.pledgeItem(e2eEvent.id);
    expect(pledge.status).toBe('active');
    expect(pledge.minimumOnly).toBe(true);
    const activeAmounts = pledge.amounts.filter((a) => a.status === 'active' && !a.hidden).map((a) => a.amount);
    expect(activeAmounts).toContain(1000);
    expect(activeAmounts).toEqual(expect.arrayContaining([1000, 5000, 10000, 25000, 100000]));
  });
});
