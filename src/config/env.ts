import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
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
  },

  api: {
    emsBaseUrl: required('EMS_API_BASE_URL').replace(/\/+$/, ''),
    liteBaseUrl: required('LITE_API_BASE_URL').replace(/\/+$/, ''),
  },
};
