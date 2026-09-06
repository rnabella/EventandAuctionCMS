import { test as setup } from '@playwright/test';
import { EmsApi } from '../../src/api/EmsApi';
import { writeEmsToken } from '../../src/api/auth';
import { env } from '../../src/config/env';
import { ensureTicketSellable } from '../../src/api/ticketFixture';

/**
 * Logs into the EMS API once per run and persists the bearer token, mirroring
 * how cms.setup.ts persists the CMS browser session. Also proves the token is
 * good for the E2E event before any test relies on it.
 */
setup('authenticate against the EMS API and prepare fixtures', async ({ request }) => {
  const token = await EmsApi.login(request, env.cms.username, env.cms.password);
  writeEmsToken(token);
  const ems = new EmsApi(request, token);
  await ems.reports.totals(env.e2e.eventId);
  // Slice 2: the ticket journey needs a ticket that is in stock and on sale.
  await ensureTicketSellable(ems, env.e2e.eventId, env.e2e.ticketId);
});
