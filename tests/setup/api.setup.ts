import { test as setup } from '@playwright/test';
import { EmsApi } from '../../src/api/EmsApi';
import { writeEmsToken } from '../../src/api/auth';
import { env } from '../../src/config/env';

/**
 * Logs into the EMS API once per run and persists the bearer token, mirroring
 * how cms.setup.ts persists the CMS browser session. Also proves the token is
 * good for the E2E event before any test relies on it.
 */
setup('authenticate against the EMS API', async ({ request }) => {
  const token = await EmsApi.login(request, env.cms.username, env.cms.password);
  writeEmsToken(token);
  await new EmsApi(request, token).reports.totals(env.e2e.eventId);
});
