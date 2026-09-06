import { test as base, expect } from '@playwright/test';
import { EmsApi } from '../src/api/EmsApi';
import { LiteApi } from '../src/api/LiteApi';
import { readEmsToken } from '../src/api/auth';
import { env } from '../src/config/env';

export interface E2EEvent {
  id: string;
  liteUiBaseUrl: string;
  /** A registered, card-verified guest used by the pure-API donation tests. */
  apiGuestId: string;
}

type FundraisingFixtures = {
  ems: EmsApi;
  e2eEvent: E2EEvent;
  lite: LiteApi;
};

/**
 * Shared fixtures for tests/api and tests/e2e. `ems` is authenticated with the
 * token written by tests/setup/api.setup.ts (projects depend on `api-setup`).
 */
export const test = base.extend<FundraisingFixtures>({
  ems: async ({ request }, use) => {
    await use(new EmsApi(request, readEmsToken()));
  },
  e2eEvent: async ({}, use) => {
    await use({ id: env.e2e.eventId, liteUiBaseUrl: env.e2e.liteUiBaseUrl, apiGuestId: env.e2e.apiGuestId });
  },
  lite: async ({ request }, use) => {
    await use(new LiteApi(request));
  },
});

export { expect };
