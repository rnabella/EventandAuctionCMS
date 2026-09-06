import { test, expect } from '@playwright/test';
import { EmsApi } from '../../src/api/EmsApi';
import { ApiError } from '../../src/api/http';
import { env } from '../../src/config/env';

test.describe('EMS API > auth and reports', () => {
  test('logs in with the CMS admin credentials and reads totals for the E2E event', async ({ request }) => {
    const token = await EmsApi.login(request, env.cms.username, env.cms.password);
    expect(token.length).toBeGreaterThan(100);

    const ems = new EmsApi(request, token);
    const totals = await ems.reports.totals(env.e2e.eventId);
    expect(totals.donation).toEqual(
      expect.objectContaining({ totalDonation: expect.any(Number), raised: expect.any(Number) }),
    );
    expect(totals.totalRaised).toBeGreaterThanOrEqual(totals.donation.raised);
  });

  test('rejects a wrong password with HTTP 401', async ({ request }) => {
    await expect(EmsApi.login(request, env.cms.username, 'definitely-wrong')).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
  });

  test('rejects an invalid bearer token with 401 unauthorized', async ({ request }) => {
    const ems = new EmsApi(request, 'not-a-real-token');
    const error = await ems.reports.totals(env.e2e.eventId).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'unauthorized' });
  });
});
