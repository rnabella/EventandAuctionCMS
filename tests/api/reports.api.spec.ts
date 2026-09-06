import { test, expect } from '../fixtures';
import { EmsApi } from '../../src/api/EmsApi';
import { ApiError } from '../../src/api/http';
import { env } from '../../src/config/env';

test.describe('EMS API > auth and reports', () => {
  test('the api-setup token reads totals for the E2E event', async ({ ems, e2eEvent }) => {
    const totals = await ems.reports.totals(e2eEvent.id);
    expect(totals.donation).toEqual(
      expect.objectContaining({ totalDonation: expect.any(Number), raised: expect.any(Number) }),
    );
    expect(totals.totalRaised).toBeGreaterThanOrEqual(totals.donation.raised);
  });

  test('login rejects a wrong password with HTTP 401', async ({ request }) => {
    await expect(EmsApi.login(request, env.cms.username, 'definitely-wrong')).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
  });

  test('rejects an invalid bearer token with 401 unauthorized', async ({ request, e2eEvent }) => {
    const anonymous = new EmsApi(request, 'not-a-real-token');
    const error = await anonymous.reports.totals(e2eEvent.id).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'unauthorized' });
  });
});
