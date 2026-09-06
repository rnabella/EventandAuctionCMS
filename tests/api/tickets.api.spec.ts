import { test, expect } from '../fixtures';
import { SELLABLE_MIN_AVAILABLE, SELLABLE_MIN_DAYS_LEFT } from '../../src/api/ticketFixture';

const DAY_MS = 86_400_000;

test.describe('EMS iBid API > fixture ticket', () => {
  test('api-setup leaves the fixture ticket sellable for at least a month', async ({ ems, e2eEvent }) => {
    const ticket = await ems.tickets.get(e2eEvent.id, e2eEvent.ticketId);
    expect(ticket).toMatchObject({ id: e2eEvent.ticketId, status: 'active', hidden: false, price: 2000 });
    expect(ticket.numberAvailable).toBeGreaterThanOrEqual(SELLABLE_MIN_AVAILABLE);
    expect((Date.parse(ticket.endTime) - Date.now()) / DAY_MS).toBeGreaterThan(SELLABLE_MIN_DAYS_LEFT);
  });
});
