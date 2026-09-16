import dotenv from 'dotenv';

// Loads `.env` by default, same as the plain `import 'dotenv/config'` this replaces. Set ENV_FILE
// to point at a different config instead — e.g. `.env.uk` for the UK environment (see
// `.env.uk.example`) — without needing a separate copy of every file that imports `env`.
// PowerShell: `$env:ENV_FILE='.env.uk'; npm run test:chrome`
// bash:       `ENV_FILE=.env.uk npm run test:chrome`
dotenv.config({ path: process.env.ENV_FILE || '.env' });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    const file = process.env.ENV_FILE || '.env';
    throw new Error(`Missing required environment variable: ${name}. Fill it in in ${file} (see .env.example / .env.uk.example).`);
  }
  return value;
}

export const env = {
  name: process.env.ENV_NAME ?? 'integration',

  cms: {
    baseUrl: required('CMS_BASE_URL'),
    username: required('CMS_USERNAME'),
    password: required('CMS_PASSWORD'),
  },

  liteUi: {
    baseUrl: required('LITE_UI_BASE_URL'),
    skipHolding: process.env.LITE_UI_SKIP_HOLDING ?? '',
  },

  testEventId: required('TEST_EVENT_ID'),

  /**
   * Fundraising / outcome suite. A dedicated, clean event: the checklist
   * suite deliberately accumulates rows on `testEventId`, which would keep
   * moving the totals these tests assert deltas on.
   */
  e2e: {
    eventId: required('E2E_EVENT_ID'),
    liteUiBaseUrl: required('E2E_LITE_UI_BASE_URL').replace(/\/+$/, ''),
    apiGuestId: required('E2E_API_GUEST_ID'),
    ticketId: required('E2E_TICKET_ID'),
    lotId: required('E2E_LOT_ID'),
    buyNowLotId: required('E2E_BUYNOW_LOT_ID'),
    sealedLotId: required('E2E_SEALED_LOT_ID'),
    raffleId: required('E2E_RAFFLE_ID'),
  },

  api: {
    emsBaseUrl: required('EMS_API_BASE_URL').replace(/\/+$/, ''),
    liteBaseUrl: required('LITE_API_BASE_URL').replace(/\/+$/, ''),
  },
};
