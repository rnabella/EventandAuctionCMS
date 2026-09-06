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
};
