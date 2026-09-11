import { test as setup } from '@playwright/test';
import { EmsApi } from '../../src/api/EmsApi';
import { writeEmsToken } from '../../src/api/auth';
import { env } from '../../src/config/env';
import { ensureTicketSellable } from '../../src/api/ticketFixture';
import { ensureLotSellable, assertNoStrayBids } from '../../src/api/lotFixture';
import { ensureRaffleSellable } from '../../src/api/raffleFixture';

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
  // Slice 3: the silent-auction/buy-now journeys need three lots that are in stock and on sale.
  await ensureLotSellable(ems, env.e2e.eventId, env.e2e.lotId);
  // numberAvailable is the lot's declared stock, not "stock minus units the buy-now
  // journey has ever actually paid for" — that latter, permanent count (reports.totals
  // buyItNow.itemsSold) is never reversed by healing, so restocking to exactly 1 leaves
  // nothing really purchasable on the public site after the very first completed sale
  // ever recorded against this lot (verified live 2026-09-07: running the buy-now e2e
  // test twice, each with its own api-setup run, showed "Sold Out" on the 2nd run even
  // though numberAvailable had just been healed back to 1). Restock to a large buffer
  // instead, exactly like ticketFixture.ts's RESTOCK_TO=1000 solves the identical
  // problem for the ticket fixture.
  await ensureLotSellable(ems, env.e2e.eventId, env.e2e.buyNowLotId, { bidMode: 'buy_now', buyNowPrice: 5000, numberAvailable: 1000 });
  await ensureLotSellable(ems, env.e2e.eventId, env.e2e.sealedLotId, { bidMode: 'sealed' });
  // Slice 4: the raffle journey needs the fixture raffle in stock and on sale.
  await ensureRaffleSellable(ems, env.e2e.eventId, env.e2e.raffleId);
  // Bid tests assert absolute lot-aggregate values (no per-guest bid listing to scope
  // to), so a bid left stray by a previously-failed run permanently breaks them with a
  // confusing mismatch. Fail fast here instead. Buy-now purchases aren't "bids" in this
  // report's sense, so only the silent and sealed lots are checked.
  await assertNoStrayBids(ems, env.e2e.eventId, [env.e2e.lotId, env.e2e.sealedLotId]);
});
