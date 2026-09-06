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

  test('the fixture ticket is on sale: active, $20, in stock, sale end in the future', async ({ lite, e2eEvent }) => {
    const tickets = await lite.tickets(e2eEvent.id);
    const ticket = tickets.find((t) => t.id === e2eEvent.ticketId);
    expect(ticket, `ticket ${e2eEvent.ticketId} not listed on the public site`).toBeDefined();
    expect(ticket).toMatchObject({ status: 'active', hidden: false, price: 2000, type: 'individual' });
    expect(ticket!.numberAvailable).toBeGreaterThanOrEqual(1);
    expect(ticket!.maxPerOrder).toBeGreaterThanOrEqual(1);
    expect(Date.parse(ticket!.endTime)).toBeGreaterThan(Date.now());
  });
});
