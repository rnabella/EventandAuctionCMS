# Donations E2E + API (Fundraising Suite, Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A donor registers on the public Lite UI, places a $10 one-off donation, pays with a Stripe test card, and the EMS API proves the money landed — plus a standalone API suite for the check-in donation endpoints.

**Architecture:** Two new layers beside the existing CMS page objects: `src/api/` (a thin `HttpClient` over Playwright's `APIRequestContext`, wrapped by `EmsApi` and `LiteApi`) and `src/pages/lite/` (page objects for the public site). Three new Playwright projects — `api-setup` (EMS login → token file), `api` (pure HTTP tests, parallel), `lite-e2e` (browser journeys, one worker) — all against a dedicated, clean E2E event that the existing checklist suite never touches. Journeys assert **deltas** on `reports/totals` and per-guest `payments/transactions`, never absolute values.

**Tech Stack:** Playwright `^1.62` (`@playwright/test` — UI + `APIRequestContext`, no HTTP library added), TypeScript 7 strict, `dotenv`. Existing conventions: `env` object from `src/config/env.ts`, `BasePage` with `protected readonly page`, setup projects writing to `playwright/.auth/`.

**Spec:** `docs/superpowers/specs/2026-09-06-fundraising-outcome-suite-design.md` — read §3 (verified environment facts) and §7 before starting. Every fact below was verified live on 2026-09-06; the memory note `lite_ui_technical_notes.md` holds the same findings.

## Global Constraints

- `npm test` must keep running **only** `setup` + `cms-auth` + `cms-chromium` and keep passing (38 tests). Nothing in this plan changes the checklist suite's behaviour.
- No new npm dependencies.
- The fundraising suite targets **only** the E2E event `5a5bef87-a9e7-11f1-90d8-92b18db85c99` / `https://us.test.givergy.com/robteste2eauto1` — never `TEST_EVENT_ID`.
- All money is in **cents** (`1000` = $10.00). Presets on the E2E event: 1000, 5000, 10000, 25000, 100000. There is **no custom-amount field** (`minimumOnly: true`) — don't plan a custom-amount test.
- Donor emails: `qa.e2e.donor+<seed>@givergy.com`. **Never `@example.com`** (the WAF drops it — 502/connection reset). Never a real person's mailbox.
- Donor mobiles: fictional `201-555-XXXX`. Stripe card: `4242 4242 4242 4242`, `12/34`, `123`, postal `10001` (publishable key is `pk_test_…` — test mode).
- Never click "Download receipt", "Set Up Donation" (recurring), or anything that sends SMS/email.
- API tests that change totals run inside one `test.describe.serial`; `test:fundraising` runs `api` **before** `lite-e2e`, never concurrently, because both read the same `reports/totals`.
- Credentials only via `.env` (`CMS_USERNAME`/`CMS_PASSWORD` are reused for the EMS API). `.env` and `playwright/.auth/` are gitignored — verify with `git status` before every commit.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/config/env.ts` (modify) | add `env.e2e` (event id, Lite UI base URL, fixed API guest id) and `env.api` (EMS/Lite API base URLs) |
| `.env.example` (modify), `.env` (local, gitignored) | the four new variables + the API guest id |
| `src/utils/money.ts` (create) | `usd(cents)` → `"10.00"`, `usdWhole(cents)` → `"10"` / `"1,000"` — the two formats the Lite UI prints |
| `src/api/http.ts` (create) | `HttpClient` (GET/POST with bearer, envelope unwrap) + `ApiError` |
| `src/api/types.ts` (create) | typed response models for every endpoint used |
| `src/api/EmsApi.ts` (create) | `EmsApi.login()`, `reports.*`, `guests.*`, `checkin.*` |
| `src/api/LiteApi.ts` (create) | public unauthenticated reads: `event()`, `pledgeItem()` |
| `src/api/auth.ts` (create) | read/write `playwright/.auth/ems-token.json` |
| `tests/setup/api.setup.ts` (create) | `api-setup` project: EMS login → token file, sanity-read totals |
| `tests/fixtures.ts` (create) | `test`/`expect` with `ems`, `lite`, `e2eEvent` fixtures |
| `tests/api/reports.api.spec.ts` (create) | login + totals shape + 401 |
| `tests/api/lite-public.api.spec.ts` (create) | Lite public event + pledge item |
| `tests/api/donations.api.spec.ts` (create) | check-in donation create/cancel/validation |
| `src/data/e2eDonor.ts` (create) | `newE2EDonor(seed)` + `STRIPE_TEST_CARD` |
| `src/pages/lite/LiteBasePage.ts` (create) | `?controller=…&action=…` URL builder, `gotoLite()` |
| `src/pages/lite/DonatePage.ts`, `LiteSignInPage.ts`, `LiteRegisterPage.ts`, `OptInsPage.ts`, `ConfirmDonationPage.ts`, `CheckoutPage.ts`, `PaymentConfirmationPage.ts` (create) | one class per donor screen |
| `tests/e2e/donation.spec.ts` (create) | the donor journey, verified via `EmsApi` |
| `playwright.config.ts` (modify) | `api-setup`, `api`, `lite-e2e` projects; narrow `setup`'s `testMatch` |
| `package.json` (modify) | `test:api`, `test:e2e`, `test:fundraising`, `test:all` |
| `README.md` (modify) | new suite docs + Lite UI gotchas |

---

### Task 1: Configuration for the E2E event and the APIs

**Files:**
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify (local only, not committed): `.env`
- Create: `src/utils/money.ts`

**Interfaces:**
- Produces: `env.e2e.eventId: string`, `env.e2e.liteUiBaseUrl: string` (no trailing slash), `env.e2e.apiGuestId: string`, `env.api.emsBaseUrl: string`, `env.api.liteBaseUrl: string` (no trailing slash); `usd(cents: number): string`, `usdWhole(cents: number): string`.

- [ ] **Step 1: Add the variables to `.env.example`**

Append to `.env.example`:

```
# ---------------------------------------------------------------------------
# Fundraising / outcome suite (tests/e2e, tests/api). Uses a DEDICATED, clean
# event that the checklist suite never writes to — see docs/superpowers/specs.
E2E_EVENT_ID=5a5bef87-a9e7-11f1-90d8-92b18db85c99
E2E_LITE_UI_BASE_URL=https://us.test.givergy.com/robteste2eauto1
# A registered, card-verified guest on the E2E event, used by the pure-API
# donation tests (they create and then cancel donations for this guest).
E2E_API_GUEST_ID=45233131-a9f2-11f1-abdd-8eb06de9a9e7

# Back-end APIs (same host as the UIs). No trailing slash.
EMS_API_BASE_URL=https://us.test.givergy.com/ems
LITE_API_BASE_URL=https://us.test.givergy.com/lite
```

- [ ] **Step 2: Add the same five lines with the same values to the local `.env`**

`.env` is gitignored; these values are not secrets (the credentials already there are reused). Run `grep -c "E2E_EVENT_ID\|EMS_API_BASE_URL" .env` — expected: `2`.

- [ ] **Step 3: Extend `src/config/env.ts`**

Replace the `export const env = { ... }` block with:

```ts
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
```

- [ ] **Step 4: Create `src/utils/money.ts`**

```ts
/**
 * The Lite UI prints the same amount two ways: "$10.00" on checkout totals
 * and "$10" / "$1,000" on preset tiles and the thank-you page. Both helpers
 * take cents, matching every API payload (`amount: 1000`).
 */
export function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function usdWhole(cents: number): string {
  return Math.round(cents / 100).toLocaleString('en-US');
}
```

- [ ] **Step 5: Typecheck and confirm the checklist suite still boots**

Run: `npm run typecheck && npx playwright test --project=cms-auth --list | tail -3`
Expected: no TS errors; `Total: 2 tests in 1 file`.

- [ ] **Step 6: Commit**

```bash
git add src/config/env.ts .env.example src/utils/money.ts
git status --short   # must NOT list .env
git commit -m "feat(config): E2E event + API base URLs for the fundraising suite

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: API client, EMS reports, and the `api` project

**Files:**
- Create: `src/api/http.ts`, `src/api/types.ts`, `src/api/EmsApi.ts`
- Modify: `playwright.config.ts` (add `api` project only; `api-setup` comes in Task 3)
- Test: `tests/api/reports.api.spec.ts`

**Interfaces:**
- Consumes: `env.api.emsBaseUrl`, `env.e2e.eventId`, `env.cms.username/password` (Task 1).
- Produces: `class HttpClient { constructor(request: APIRequestContext, baseUrl: string, token?: string); get<T>(path, params?): Promise<T>; post<T>(path, data?): Promise<T> }`; `class ApiError extends Error { method; url; status: number; code?: string; body: unknown }`; `class EmsApi { constructor(request, token: string); static login(request, username, password): Promise<string>; reports.totals(eventId): Promise<Totals>; reports.donations(eventId, opts?): Promise<DonationReportRow[]> }`; types `Totals`, `DonationReportRow`.

- [ ] **Step 1: Write the failing test**

`tests/api/reports.api.spec.ts`:

```ts
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
    await expect(EmsApi.login(request, env.cms.username, 'definitely-wrong')).rejects.toMatchObject({ status: 401 });
  });

  test('rejects an invalid bearer token with 401 unauthorized', async ({ request }) => {
    const ems = new EmsApi(request, 'not-a-real-token');
    const error = await ems.reports.totals(env.e2e.eventId).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'unauthorized' });
  });
});
```

- [ ] **Step 2: Add the `api` project so the test can be run**

In `playwright.config.ts`, inside `projects: [ ... ]`, replace the trailing comment `// Firefox/WebKit and Lite UI-specific projects are added in Phase 2 ...` with:

```ts
    {
      // Pure HTTP tests against the EMS / Lite APIs (tests/api). No browser.
      // Absolute URLs come from env.api.*, so the global CMS baseURL is unused here.
      name: 'api',
      testDir: './tests/api',
    },
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx playwright test --project=api`
Expected: FAIL — `Cannot find module '../../src/api/EmsApi'`.

- [ ] **Step 4: Create `src/api/http.ts`**

```ts
import { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Thrown for any non-2xx response, and for enveloped responses whose `code`
 * is not "ok". Carries the backend's own `code`/body so a failing test reads
 * as the server's reason ("notFound", "unauthorized") rather than a parse error.
 */
export class ApiError extends Error {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly status: number,
    readonly code: string | undefined,
    readonly body: unknown,
  ) {
    const summary = typeof body === 'string' ? body : JSON.stringify(body);
    super(`${method} ${url} -> HTTP ${status}${code ? ` (${code})` : ''}: ${summary.slice(0, 300)}`);
    this.name = 'ApiError';
  }
}

/**
 * Minimal JSON client over Playwright's APIRequestContext.
 *
 * The Givergy back ends mix two response styles:
 *  - enveloped: `{ code: "ok", message, extra, entity, totalCount }` (EMS reports,
 *    cancel-donation, all Lite endpoints) — unwrapped to `entity`;
 *  - bare payloads (check-in make-donation, per-guest payments/transactions and
 *    payments/checkout) — returned as-is.
 * `parse()` unwraps only when both `code` and `entity` keys are present.
 */
export class HttpClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const response = await this.request.get(this.url(path), { headers: this.headers(), params });
    return this.parse<T>('GET', path, response);
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    const response = await this.request.post(this.url(path), { headers: this.headers(), data });
    return this.parse<T>('POST', path, response);
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
  }

  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private async parse<T>(method: string, path: string, response: APIResponse): Promise<T> {
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // non-JSON body (e.g. an HTML error page) — keep the raw text for the error message
    }
    const envelope = body as { code?: string; entity?: unknown } | null;
    const code = envelope && typeof envelope === 'object' ? envelope.code : undefined;
    if (!response.ok()) {
      throw new ApiError(method, path, response.status(), code, body);
    }
    if (envelope && typeof envelope === 'object' && 'code' in envelope && 'entity' in envelope) {
      if (envelope.code !== 'ok') {
        throw new ApiError(method, path, response.status(), envelope.code, body);
      }
      return envelope.entity as T;
    }
    return body as T;
  }
}
```

- [ ] **Step 5: Create `src/api/types.ts`**

```ts
// Response models for the endpoints the fundraising suite uses. Shapes were
// captured from the live Integration environment on 2026-09-06. Money is cents.

/** GET ems/checkin/v1/events/:eventId/reports/totals (enveloped) */
export interface Totals {
  totalRaised: number;
  charityProfit: number;
  silentAuction: { totalItems: number; itemsSold: number; raised: number; charityProfit: number };
  liveAuction: { totalItems: number; itemsSold: number; raised: number; charityProfit: number };
  buyItNow: { totalItems: number; itemsSold: number; raised: number; charityProfit: number };
  donation: { totalDonation: number; raised: number; totalDotation: number };
  raffles: {
    totalItems: number;
    raffleEntries: number;
    jackpotEntries: number;
    prizeEntries: number;
    totalRaised: number;
    prizePot: number;
  };
}

/** GET .../reports/donation?status=ACTIVE (enveloped; one row per donation, `totalCount` is always 0) */
export interface DonationReportRow {
  id: string; // the pledge item's title, e.g. "Donations"
  name: string; // donor full name
  qty: number;
  totalValue: number;
  fundId: string | null;
  fundTitle: string | null;
}

/** POST .../guests/:guestId/donations (BARE payload, HTTP 200 even when rejected) */
export interface CheckinDonationResult {
  id: string; // donation id — pass to cancelDonation
  pledgeId: string;
  code: 'accepted' | 'invalid_amount' | string;
  message: string;
  amount: number;
  total: number; // guest's running donation total after this call
}

/** POST .../guests/:guestId/donations/cancel (enveloped; entity is the retracted donation) */
export interface CancelledDonation {
  id: string;
  guestId: string;
  guestName: string;
  eventId: string;
  amount: number;
  amountPaid: number;
  anonymous: boolean;
}

/** GET .../guests/:guestId/payments/transactions (BARE array) */
export interface PaymentTransaction {
  id: string;
  itemDisplayNumber: string;
  description: string;
  recordType: 'donation' | string;
  guestId: string;
  guestName: string;
  amountDue: number;
  amountPaid: number;
  paymentStatus: 'paid' | string;
  paymentStatusReason: string;
  sourceApp: string;
  itemId: string;
  itemPurchaseId: string;
  itemCount: number;
  itemUnitPrice: number;
  itemTotalAmount: number;
}

export interface PaymentRecord {
  id: string;
  transactionId: string; // Stripe charge id, e.g. "ch_..."
  status: 'paid' | string;
  processor: 'stripe' | string;
  amount: number;
  totalPremiumAmount: number;
  currency: string;
  cardLast4: string;
  cardBrand: string;
  created: string;
  paymentTransactions: PaymentTransaction[];
}

/** GET .../guests/:guestId/payments/checkout (BARE object) — what the guest still owes */
export interface GuestCheckout {
  donations: Array<{ itemId: string; purchaseId: string; title: string; totalAmount: number }>;
  bids: unknown[];
  ticketPurchases: unknown[];
  totalAmount: number;
  totalPremiumAmount: number;
  subTotal: number;
  grandTotal: number;
  currency: string;
}

/** GET lite/v1/events/:eventId (enveloped) — public event configuration */
export interface LiteEvent {
  id: string;
  name: string;
  currency: string;
  currencyCode: string;
  paymentEnabled: boolean;
  paymentProcessor: string;
  pledgeEnabled: boolean;
  pledgeOnLite: boolean;
  preAuthorizeEnabled: boolean;
}

/** GET lite/v1/events/:eventId/pledges/campaignItem (enveloped) — the donation item */
export interface PledgeAmount {
  id: string;
  amount: number;
  description: string;
  allowRecurring: boolean;
  hidden: boolean;
  status: 'active' | string;
}

export interface PledgeItem {
  id: string;
  title: string;
  status: 'active' | string;
  amounts: PledgeAmount[];
  minimum: number;
  minimumOnly: boolean;
  target: number;
  total: number;
}
```

- [ ] **Step 6: Create `src/api/EmsApi.ts`**

```ts
import { APIRequestContext } from '@playwright/test';
import { env } from '../config/env';
import { ApiError, HttpClient } from './http';
import { CancelledDonation, CheckinDonationResult, DonationReportRow, GuestCheckout, PaymentRecord, Totals } from './types';

/**
 * The EMS ("back office") API at env.api.emsBaseUrl. Authenticated with the
 * bearer token returned by `EmsApi.login()` — the same CMS admin credentials.
 */
export class EmsApi {
  private readonly http: HttpClient;

  constructor(request: APIRequestContext, token: string, baseUrl: string = env.api.emsBaseUrl) {
    this.http = new HttpClient(request, baseUrl, token);
  }

  /**
   * POST checkin/v1/auth/login. Not enveloped: `{ id, role, fullName, twoFactorRequired, authToken }`.
   * The test admin has no 2FA, so `authToken` is usable straight away.
   */
  static async login(
    request: APIRequestContext,
    username: string,
    password: string,
    baseUrl: string = env.api.emsBaseUrl,
  ): Promise<string> {
    const path = 'checkin/v1/auth/login';
    const response = await request.post(`${baseUrl}/${path}`, { data: { username, password, version: 0 } });
    if (!response.ok()) {
      throw new ApiError('POST', path, response.status(), undefined, await response.text());
    }
    const body = (await response.json()) as { authToken: string; twoFactorRequired: boolean };
    if (body.twoFactorRequired) {
      throw new Error('EMS login requires 2FA for this account; the API suite needs a non-2FA test admin.');
    }
    return body.authToken;
  }

  readonly reports = {
    totals: (eventId: string) => this.http.get<Totals>(`checkin/v1/events/${eventId}/reports/totals`),

    /** Without `status=ACTIVE` the report also lists cancelled donations. */
    donations: (eventId: string, opts: { status?: 'ACTIVE'; offset?: number; limit?: number } = {}) =>
      this.http.get<DonationReportRow[]>(`checkin/v1/events/${eventId}/reports/donation`, {
        status: opts.status ?? 'ACTIVE',
        offset: opts.offset ?? 0,
        limit: opts.limit ?? 50,
      }),
  };

  readonly guests = {
    paymentTransactions: (eventId: string, guestId: string) =>
      this.http.get<PaymentRecord[]>(`checkin/v1/events/${eventId}/guests/${guestId}/payments/transactions`),

    checkout: (eventId: string, guestId: string) =>
      this.http.get<GuestCheckout>(`checkin/v1/events/${eventId}/guests/${guestId}/payments/checkout`),
  };

  /** Staff-side ("check-in") actions performed on a guest's behalf. */
  readonly checkin = {
    /** Counts toward reports/totals immediately (no payment step) — same as a Lite UI placement. */
    makeDonation: (eventId: string, guestId: string, body: { pledgeId: string; amount: number; anonymous?: boolean }) =>
      this.http.post<CheckinDonationResult>(`checkin/v1/events/${eventId}/guests/${guestId}/donations`, {
        pledgeId: body.pledgeId,
        amount: body.amount,
        anonymous: body.anonymous ?? false,
        showPopup: false,
      }),

    /** Idempotent: cancelling an already-cancelled donation returns 200 again. */
    cancelDonation: (eventId: string, guestId: string, donationId: string) =>
      this.http.post<CancelledDonation>(`checkin/v1/events/${eventId}/guests/${guestId}/donations/cancel`, {
        id: donationId,
      }),
  };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx playwright test --project=api`
Expected: `3 passed`.

- [ ] **Step 8: Commit**

```bash
git add src/api/http.ts src/api/types.ts src/api/EmsApi.ts tests/api/reports.api.spec.ts playwright.config.ts
git commit -m "feat(api): HttpClient, EmsApi (login, reports, guests, check-in donations) + api project

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Token file, `api-setup` project, shared fixtures, `lite-e2e` project

**Files:**
- Create: `src/api/auth.ts`, `tests/setup/api.setup.ts`, `tests/fixtures.ts`
- Modify: `playwright.config.ts` (narrow `setup`'s `testMatch`; add `api-setup` + `lite-e2e`; make `api` depend on `api-setup`)
- Modify: `tests/api/reports.api.spec.ts` (use the fixture)

**Interfaces:**
- Consumes: `EmsApi` (Task 2).
- Produces: `EMS_TOKEN_FILE: string`, `readEmsToken(): string`, `writeEmsToken(token: string): void`; `test`/`expect` from `tests/fixtures.ts` with fixtures `ems: EmsApi` and `e2eEvent: { id: string; liteUiBaseUrl: string; apiGuestId: string }` (the `lite: LiteApi` fixture is added in Task 4, once `LiteApi` exists).

- [ ] **Step 1: Create `src/api/auth.ts`**

```ts
import fs from 'fs';
import path from 'path';

/** Written by tests/setup/api.setup.ts; read by the `ems` fixture. Gitignored via playwright/.auth/. */
export const EMS_TOKEN_FILE = path.join(__dirname, '../../playwright/.auth/ems-token.json');

export function writeEmsToken(token: string): void {
  fs.mkdirSync(path.dirname(EMS_TOKEN_FILE), { recursive: true });
  fs.writeFileSync(EMS_TOKEN_FILE, JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2));
}

export function readEmsToken(): string {
  if (!fs.existsSync(EMS_TOKEN_FILE)) {
    throw new Error(`${EMS_TOKEN_FILE} not found — run the "api-setup" project first (npm run test:api / test:e2e do this).`);
  }
  return (JSON.parse(fs.readFileSync(EMS_TOKEN_FILE, 'utf8')) as { token: string }).token;
}
```

- [ ] **Step 2: Create `tests/setup/api.setup.ts`**

```ts
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
```

- [ ] **Step 3: Create `tests/fixtures.ts`**

```ts
import { test as base, expect } from '@playwright/test';
import { EmsApi } from '../src/api/EmsApi';
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
});

export { expect };
```

- [ ] **Step 4: Update `playwright.config.ts` projects**

Change the existing `setup` project's `testMatch` from `'**/*.setup.ts'` to `'**/cms.setup.ts'` (otherwise it would also pick up `api.setup.ts`). Then replace the `api` project added in Task 2 with these three:

```ts
    {
      // EMS API login → playwright/.auth/ems-token.json (see tests/setup/api.setup.ts).
      name: 'api-setup',
      testMatch: '**/api.setup.ts',
    },
    {
      // Pure HTTP tests against the EMS / Lite APIs (tests/api). No browser.
      // Absolute URLs come from env.api.*, so the global CMS baseURL is unused here.
      name: 'api',
      testDir: './tests/api',
      dependencies: ['api-setup'],
    },
    {
      // Donor journeys on the public Lite UI (tests/e2e), verified through the
      // EMS API. Every journey moves the same event totals, so these must never
      // interleave: fullyParallel is off here AND `npm run test:e2e` passes
      // --workers=1 (Playwright has no per-project worker cap).
      name: 'lite-e2e',
      testDir: './tests/e2e',
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['api-setup'],
    },
```

- [ ] **Step 5: Refactor `tests/api/reports.api.spec.ts` to use the fixture**

Replace the file's contents with:

```ts
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
    await expect(EmsApi.login(request, env.cms.username, 'definitely-wrong')).rejects.toMatchObject({ status: 401 });
  });

  test('rejects an invalid bearer token with 401 unauthorized', async ({ request, e2eEvent }) => {
    const anonymous = new EmsApi(request, 'not-a-real-token');
    const error = await anonymous.reports.totals(e2eEvent.id).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'unauthorized' });
  });
});
```

- [ ] **Step 6: Run both the new projects and the untouched checklist setup**

Run: `npx playwright test --project=api-setup --project=api`
Expected: `4 passed` (1 setup + 3 tests); `playwright/.auth/ems-token.json` exists.

Run: `npx playwright test --project=setup --list`
Expected: exactly `1 test` — `tests/setup/cms.setup.ts` (proves `api.setup.ts` is no longer matched by the CMS setup project).

- [ ] **Step 7: Commit**

```bash
git add src/api/auth.ts tests/setup/api.setup.ts tests/fixtures.ts tests/api/reports.api.spec.ts playwright.config.ts
git status --short   # playwright/.auth must NOT appear
git commit -m "feat(api): api-setup project (token file), shared fixtures, lite-e2e project

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `LiteApi` — public reads of the event and its donation item

**Files:**
- Create: `src/api/LiteApi.ts`
- Modify: `tests/fixtures.ts` (add `lite`)
- Test: `tests/api/lite-public.api.spec.ts`

**Interfaces:**
- Consumes: `HttpClient` (Task 2), `env.api.liteBaseUrl` (Task 1).
- Produces: `class LiteApi { constructor(request); event(eventId): Promise<LiteEvent>; pledgeItem(eventId): Promise<PledgeItem> }`; fixture `lite: LiteApi`.

- [ ] **Step 1: Write the failing test**

`tests/api/lite-public.api.spec.ts`:

```ts
import { test, expect } from '../fixtures';

test.describe('Lite public API > E2E event', () => {
  test('the event accepts card payments via Stripe in USD', async ({ lite, e2eEvent }) => {
    const event = await lite.event(e2eEvent.id);
    expect(event).toMatchObject({
      id: e2eEvent.id,
      currencyCode: 'USD',
      paymentEnabled: true,
      paymentProcessor: 'stripe',
      pledgeEnabled: true,
      pledgeOnLite: true,
    });
  });

  test('the donation item is active with a $10 preset and no custom amount', async ({ lite, e2eEvent }) => {
    const pledge = await lite.pledgeItem(e2eEvent.id);
    expect(pledge.status).toBe('active');
    expect(pledge.minimumOnly).toBe(true);
    const activeAmounts = pledge.amounts.filter((a) => a.status === 'active' && !a.hidden).map((a) => a.amount);
    expect(activeAmounts).toContain(1000);
    expect(activeAmounts).toEqual(expect.arrayContaining([1000, 5000, 10000, 25000, 100000]));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project=api-setup --project=api lite-public`
Expected: FAIL — TypeScript/fixture error: `lite` is not a fixture.

- [ ] **Step 3: Create `src/api/LiteApi.ts`**

```ts
import { APIRequestContext } from '@playwright/test';
import { env } from '../config/env';
import { HttpClient } from './http';
import { LiteEvent, PledgeItem } from './types';

/**
 * The public Lite back end the donor-facing site itself calls. Reads need no
 * auth. Every response is enveloped (`{ requestId, code, message, entity }`).
 */
export class LiteApi {
  private readonly http: HttpClient;

  constructor(request: APIRequestContext, baseUrl: string = env.api.liteBaseUrl) {
    this.http = new HttpClient(request, baseUrl);
  }

  event(eventId: string) {
    return this.http.get<LiteEvent>(`v1/events/${eventId}`);
  }

  /** The campaign's single donation ("pledge") item, including its preset amounts. */
  pledgeItem(eventId: string) {
    return this.http.get<PledgeItem>(`v1/events/${eventId}/pledges/campaignItem`);
  }
}
```

- [ ] **Step 4: Add the `lite` fixture to `tests/fixtures.ts`**

Add `import { LiteApi } from '../src/api/LiteApi';`, add `lite: LiteApi;` to `FundraisingFixtures`, and add to the `extend` object:

```ts
  lite: async ({ request }, use) => {
    await use(new LiteApi(request));
  },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx playwright test --project=api-setup --project=api`
Expected: `6 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/api/LiteApi.ts tests/fixtures.ts tests/api/lite-public.api.spec.ts
git commit -m "feat(api): LiteApi public reads (event, pledge item) + fixture

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Check-in donation API suite (create → totals → cancel, validation)

**Files:**
- Test: `tests/api/donations.api.spec.ts`

**Interfaces:**
- Consumes: `ems.checkin.makeDonation / cancelDonation`, `ems.reports.totals / donations`, `lite.pledgeItem`, `e2eEvent.apiGuestId` (Tasks 2–4).
- Produces: nothing new — this is coverage.

Verified behaviour this task encodes: `makeDonation` returns HTTP 200 with `code: "accepted"` and counts in `reports/totals` immediately; `amount: 0` → 200 with `code: "invalid_amount"`; unknown pledge → 404 `notFound`; `cancelDonation` → enveloped `ok`, totals decrement immediately, idempotent; unknown id → 404 `notFound`.

- [ ] **Step 1: Write the tests**

```ts
import { test, expect } from '../fixtures';
import { Totals } from '../../src/api/types';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// These tests move the E2E event's totals, so they run serially and each one
// cancels what it created — the suite leaves totals exactly where it found them.
test.describe.serial('EMS check-in API > donations (create / cancel)', () => {
  let pledgeId: string;

  test.beforeAll(async ({ lite, e2eEvent }) => {
    pledgeId = (await lite.pledgeItem(e2eEvent.id)).id;
  });

  const donationRaised = (t: Totals) => t.donation.raised;

  test('a $10 donation is accepted, counts toward totals immediately, and cancelling reverses it', async ({ ems, e2eEvent }) => {
    const before = await ems.reports.totals(e2eEvent.id);

    const result = await ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId, amount: 1000 });
    expect(result).toMatchObject({ code: 'accepted', amount: 1000, pledgeId });
    expect(result.id).toMatch(UUID);

    try {
      await expect
        .poll(async () => donationRaised(await ems.reports.totals(e2eEvent.id)) - donationRaised(before), { timeout: 15_000 })
        .toBe(1000);
      const rows = await ems.reports.donations(e2eEvent.id);
      expect(rows).toContainEqual(expect.objectContaining({ totalValue: 1000, qty: 1 }));
    } finally {
      const cancelled = await ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, result.id);
      expect(cancelled).toMatchObject({ id: result.id, amount: 1000, guestId: e2eEvent.apiGuestId });
    }

    await expect
      .poll(async () => donationRaised(await ems.reports.totals(e2eEvent.id)) - donationRaised(before), { timeout: 15_000 })
      .toBe(0);
    const after = await ems.reports.totals(e2eEvent.id);
    expect(after.donation.totalDonation).toBe(before.donation.totalDonation);
    expect(after.totalRaised).toBe(before.totalRaised);
  });

  test('cancelling the same donation twice is idempotent', async ({ ems, e2eEvent }) => {
    const result = await ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId, amount: 1000 });
    expect(result.code).toBe('accepted');

    const first = await ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, result.id);
    const second = await ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, result.id);
    expect(first.id).toBe(result.id);
    expect(second.id).toBe(result.id);
  });
});

test.describe('EMS check-in API > donations (validation)', () => {
  test('a zero amount is rejected with code invalid_amount (HTTP 200)', async ({ ems, lite, e2eEvent }) => {
    const pledgeId = (await lite.pledgeItem(e2eEvent.id)).id;
    const result = await ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId, amount: 0 });
    expect(result).toMatchObject({ code: 'invalid_amount', amount: 0 });
  });

  test('an unknown pledge id returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(
      ems.checkin.makeDonation(e2eEvent.id, e2eEvent.apiGuestId, { pledgeId: ZERO_UUID, amount: 1000 }),
    ).rejects.toMatchObject({ status: 404, code: 'notFound' });
  });

  test('cancelling an unknown donation returns 404 notFound', async ({ ems, e2eEvent }) => {
    await expect(ems.checkin.cancelDonation(e2eEvent.id, e2eEvent.apiGuestId, ZERO_UUID)).rejects.toMatchObject({
      status: 404,
      code: 'notFound',
    });
  });
});
```

- [ ] **Step 2: Run the suite — and run it twice to prove it is self-cleaning**

Run: `npx playwright test --project=api-setup --project=api donations && npx playwright test --project=api-setup --project=api donations`
Expected: `6 passed` both times. Then run `npx playwright test --project=api-setup --project=api reports` and confirm the totals test still passes (totals unchanged by the donation suite).

- [ ] **Step 3: Commit**

```bash
git add tests/api/donations.api.spec.ts
git commit -m "test(api): check-in donation create/cancel/validation suite

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Lite page objects through registration (donor data, Donate, Sign-in, Register, Opt-ins)

**Files:**
- Create: `src/data/e2eDonor.ts`, `src/pages/lite/LiteBasePage.ts`, `src/pages/lite/DonatePage.ts`, `src/pages/lite/LiteSignInPage.ts`, `src/pages/lite/LiteRegisterPage.ts`, `src/pages/lite/OptInsPage.ts`, `src/pages/lite/ConfirmDonationPage.ts`
- Test: `tests/e2e/donation.spec.ts` (first, partial version — extended in Task 7)

**Interfaces:**
- Consumes: `env.e2e.liteUiBaseUrl` (Task 1), `usdWhole` (Task 1), `BasePage`.
- Produces: `E2EDonor { firstName; lastName; email; mobile; password }`, `newE2EDonor(seed?: number): E2EDonor`, `STRIPE_TEST_CARD: { number; expiry; cvc; postalCode }`; `DonatePage.goto()`, `.selectPresetAmount(cents)`, `.clickDonate()`; `LiteSignInPage.continueWithEmail(email)`; `LiteRegisterPage.waitForPage()`, `.fillDetails(donor)`, `.fillCard(card, nameOnCard)`, `.setCoverProcessingFee(on)`, `.submit(): Promise<string /* guestId */>`; `OptInsPage.continueWithDefaults()`; `ConfirmDonationPage.waitForPage()`, `.expectAmount(cents)`, `.placeDonation(): Promise<string /* purchaseId */>`.

- [ ] **Step 1: Write the failing (partial) journey test**

`tests/e2e/donation.spec.ts`:

```ts
import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { DonatePage } from '../../src/pages/lite/DonatePage';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { ConfirmDonationPage } from '../../src/pages/lite/ConfirmDonationPage';

test.describe.serial('Lite UI > Donations (donor journey, verified via the EMS API)', () => {
  test('a new donor registers with a test card and reaches the $10 donation confirmation', async ({ page }) => {
    const donor = newE2EDonor();
    const amount = 1000;

    const donate = new DonatePage(page);
    await donate.goto();
    await donate.selectPresetAmount(amount);
    await donate.clickDonate();

    await new LiteSignInPage(page).continueWithEmail(donor.email);

    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, `${donor.firstName} ${donor.lastName}`);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    expect(guestId).toMatch(/^[0-9a-f-]{36}$/);

    await new OptInsPage(page).continueWithDefaults();

    const confirm = new ConfirmDonationPage(page);
    await confirm.waitForPage();
    await confirm.expectAmount(amount);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1`
Expected: FAIL — `Cannot find module '../../src/data/e2eDonor'`.

- [ ] **Step 3: Create `src/data/e2eDonor.ts`**

```ts
export interface E2EDonor {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
}

/**
 * A fresh donor identity per run. The Lite UI checks BOTH email and mobile for
 * existing registrations, so both are derived from the seed. Emails stay on the
 * givergy.com domain (the WAF drops example.com), mobiles use the 201-555 range
 * (fictional in NANP), and no real inbox or phone is ever involved.
 */
export function newE2EDonor(seed: number = Date.now()): E2EDonor {
  return {
    firstName: 'QA',
    lastName: `E2E Donor ${seed % 100_000}`,
    email: `qa.e2e.donor+${seed}@givergy.com`,
    mobile: `201555${String(seed % 10_000).padStart(4, '0')}`,
    password: `Qa!e2e-${seed}`,
  };
}

/** Stripe's standard successful test card. The E2E event's Stripe account is in test mode (pk_test_…). */
export const STRIPE_TEST_CARD = {
  number: '4242424242424242',
  expiry: '12/34',
  cvc: '123',
  postalCode: '10001',
};
```

- [ ] **Step 4: Create `src/pages/lite/LiteBasePage.ts`**

```ts
import { BasePage } from '../BasePage';
import { env } from '../../config/env';

/**
 * The public Lite UI is a query-string-routed app: every screen is
 * `/?controller=<c>&action=<a>&...`. Pages navigate with `gotoLite()` and wait
 * for their own landmark element — several screens (checkout, in particular)
 * poll the back end forever and never reach `networkidle`.
 */
export abstract class LiteBasePage extends BasePage {
  protected liteUrl(controller: string, action?: string, params: Record<string, string> = {}): string {
    const search = new URLSearchParams({ controller, ...(action ? { action } : {}), ...params, tabletMode: 'false' });
    return `${env.e2e.liteUiBaseUrl}/?${search.toString()}`;
  }

  protected async gotoLite(controller: string, action?: string, params?: Record<string, string>): Promise<void> {
    await this.page.goto(this.liteUrl(controller, action, params), { waitUntil: 'domcontentloaded' });
  }
}
```

- [ ] **Step 5: Create `src/pages/lite/DonatePage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usdWhole } from '../../utils/money';

/** `?controller=pledges&action=campaignPledge` — "Make a donation". */
export class DonatePage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Make a donation' });
  readonly donateButton = this.page.getByRole('button', { name: 'Donate', exact: true });

  async goto(): Promise<void> {
    await this.gotoLite('pledges', 'campaignPledge');
    await this.heading.waitFor();
  }

  /**
   * Preset tiles are `<label role="radio">` named like "Donate $10 Please donate $10.00".
   * Their aria-checked never updates (selection is a CSS class), so Playwright's
   * `.check()` refuses them — click, then assert the `selected` class instead.
   */
  presetAmount(amountCents: number) {
    return this.page.getByRole('radio', { name: new RegExp(`^Donate \\$${usdWhole(amountCents)}\\b`) });
  }

  async selectPresetAmount(amountCents: number): Promise<void> {
    const tile = this.presetAmount(amountCents);
    await tile.click();
    await expect(tile).toHaveClass(/selected/);
  }

  /** Unauthenticated donors are redirected to sign-in; signed-in donors go straight to confirmation. */
  async clickDonate(): Promise<void> {
    await this.donateButton.click();
  }
}
```

- [ ] **Step 6: Create `src/pages/lite/LiteSignInPage.ts`**

```ts
import { LiteBasePage } from './LiteBasePage';

/**
 * `?controller=guest&action=checkRegistration` — "Sign in". Defaults to phone
 * (which would send a real SMS code); the email path is a link on the form.
 * Behind invisible reCAPTCHA Enterprise — headless Chromium passes it.
 */
export class LiteSignInPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Sign in' });
  readonly signInViaEmailLink = this.page.getByRole('link', { name: 'Sign in via email' });
  readonly emailField = this.page.getByRole('textbox', { name: 'Email' });
  // Renders as "Loading..." until the captcha token is ready; getByRole waits for the real label.
  readonly continueButton = this.page.getByRole('button', { name: 'Continue' });

  /** For a never-seen email the site moves on to the registration form ("Enter your details"). */
  async continueWithEmail(email: string): Promise<void> {
    await this.heading.waitFor();
    await this.signInViaEmailLink.click();
    await this.emailField.fill(email);
    await this.continueButton.click();
  }
}
```

- [ ] **Step 7: Create `src/pages/lite/LiteRegisterPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { E2EDonor, STRIPE_TEST_CARD } from '../../data/e2eDonor';

type Card = typeof STRIPE_TEST_CARD;

/**
 * `?controller=guest&action=register` — "Enter your details". One form does
 * both jobs: creates the guest (POST lite/v1/events/:id/auth/guests) and
 * pre-authorises a card (POST .../payment/authorize) via Stripe Elements,
 * which render card number / expiry / CVC in three separate iframes.
 */
export class LiteRegisterPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Enter your details' });
  readonly firstName = this.page.getByRole('textbox', { name: 'First Name' });
  readonly lastName = this.page.getByRole('textbox', { name: 'Last Name' });
  readonly mobile = this.page.getByRole('textbox', { name: 'Mobile' });
  readonly password = this.page.getByRole('textbox', { name: /Create Password/ });
  readonly nameOnCard = this.page.getByPlaceholder('Name on card');
  readonly postalCode = this.page.getByPlaceholder('Postal Code');
  /** Checked by default — adds a 3.95% processing fee on top of every payment. */
  readonly paymentFeeCheckbox = this.page.getByRole('checkbox', { name: 'Payment Fee' });
  readonly nextButton = this.page.getByRole('button', { name: 'Next' });

  async waitForPage(): Promise<void> {
    await this.heading.waitFor();
  }

  async fillDetails(donor: E2EDonor): Promise<void> {
    await this.firstName.fill(donor.firstName);
    await this.lastName.fill(donor.lastName);
    await this.mobile.fill(donor.mobile);
    await this.password.fill(donor.password);
  }

  private stripeField(frameTitle: string, placeholder: string) {
    return this.page.frameLocator(`iframe[title="${frameTitle}"]`).getByPlaceholder(placeholder);
  }

  async fillCard(card: Card, nameOnCard: string): Promise<void> {
    await this.stripeField('Secure card number input frame', '1234 1234 1234 1234').fill(card.number);
    await this.stripeField('Secure expiration date input frame', 'MM / YY').fill(card.expiry);
    await this.stripeField('Secure CVC input frame', 'CVC').fill(card.cvc);
    await this.nameOnCard.fill(nameOnCard);
    await this.postalCode.fill(card.postalCode);
  }

  async setCoverProcessingFee(on: boolean): Promise<void> {
    if ((await this.paymentFeeCheckbox.isChecked()) !== on) {
      await this.paymentFeeCheckbox.click({ force: true });
    }
    await expect(this.paymentFeeCheckbox).toBeChecked({ checked: on });
  }

  /**
   * Submits the form and returns the new guest's id, taken from the
   * `auth/guests` response — the E2E test needs it to query this guest's
   * payment transactions through the EMS API afterwards.
   */
  async submit(): Promise<string> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/auth\/guests(\?|$)/.test(r.url()),
      ),
      this.nextButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: { id: string } | null };
    if (body.code !== 'ok' || !body.entity) {
      throw new Error(`Lite registration failed: ${body.code} — ${body.message}`);
    }
    return body.entity.id;
  }
}
```

- [ ] **Step 8: Create `src/pages/lite/OptInsPage.ts`**

```ts
import { LiteBasePage } from './LiteBasePage';

/** `?controller=guest&action=register2` — "Stay connected" marketing opt-ins shown once after registering. */
export class OptInsPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Stay connected' });
  readonly continueButton = this.page.getByRole('button', { name: 'Continue' });

  /** Leaves every opt-in at its default and moves on. */
  async continueWithDefaults(): Promise<void> {
    await this.heading.waitFor();
    await this.continueButton.click();
  }
}
```

- [ ] **Step 9: Create `src/pages/lite/ConfirmDonationPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usdWhole } from '../../utils/money';

/**
 * `?controller=pledges&action=confirmDonation` — "Confirm Your Donation".
 * "Place Donation" commits the pledge (POST .../guests/:id/donations); the
 * event's totals move immediately, BEFORE payment. Payment happens next on
 * the checkout page.
 */
export class ConfirmDonationPage extends LiteBasePage {
  readonly placeDonationButton = this.page.getByRole('button', { name: 'Place Donation' });

  async waitForPage(): Promise<void> {
    await this.placeDonationButton.waitFor();
  }

  async expectAmount(amountCents: number): Promise<void> {
    await expect(this.page.locator('main')).toContainText(`Your Donation: $${usdWhole(amountCents)}`);
  }

  /** Returns the purchase id the back end assigned to this donation. */
  async placeDonation(): Promise<string> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/donations(\?|$)/.test(r.url()),
      ),
      this.placeDonationButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: { code: string; purchaseId: string } | null };
    if (body.code !== 'ok' || body.entity?.code !== 'accepted') {
      throw new Error(`Placing the donation failed: ${body.code}/${body.entity?.code} — ${body.message}`);
    }
    return body.entity.purchaseId;
  }
}
```

- [ ] **Step 10: Run the partial journey**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1`
Expected: `2 passed` (setup + journey), ~45–60 s. If it fails on the fee checkbox, open the trace (`npx playwright show-trace test-results/**/trace.zip`) — the fallback is clicking the visible "Payment Fee" text instead of the hidden input.

- [ ] **Step 11: Commit**

```bash
git add src/data/e2eDonor.ts src/pages/lite tests/e2e/donation.spec.ts
git commit -m "feat(lite): donor page objects through registration + partial donation journey

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Place, pay, and verify — the complete donation journey

**Files:**
- Create: `src/pages/lite/CheckoutPage.ts`, `src/pages/lite/PaymentConfirmationPage.ts`
- Modify: `tests/e2e/donation.spec.ts` (extend the one test into the full journey)

**Interfaces:**
- Consumes: everything from Task 6; `ems.reports.totals / donations`, `ems.guests.paymentTransactions / checkout` (Task 2); `usd`, `usdWhole` (Task 1).
- Produces: `CheckoutPage.waitForPage()`, `.setCoverProcessingFee(on)`, `.expectTotalPayment(cents)`, `.payWithSavedCard(last4?)`; `PaymentConfirmationPage.expectSuccess(cents)`.

- [ ] **Step 1: Extend the test into the full journey (it will fail — modules missing)**

Replace the test body in `tests/e2e/donation.spec.ts` so the file becomes:

```ts
import { test, expect } from '../fixtures';
import { newE2EDonor, STRIPE_TEST_CARD } from '../../src/data/e2eDonor';
import { DonatePage } from '../../src/pages/lite/DonatePage';
import { LiteSignInPage } from '../../src/pages/lite/LiteSignInPage';
import { LiteRegisterPage } from '../../src/pages/lite/LiteRegisterPage';
import { OptInsPage } from '../../src/pages/lite/OptInsPage';
import { ConfirmDonationPage } from '../../src/pages/lite/ConfirmDonationPage';
import { CheckoutPage } from '../../src/pages/lite/CheckoutPage';
import { PaymentConfirmationPage } from '../../src/pages/lite/PaymentConfirmationPage';

// Every journey here moves the same event totals — serial within the file, and
// `npm run test:e2e` runs this project with --workers=1.
test.describe.serial('Lite UI > Donations (donor journey, verified via the EMS API)', () => {
  test('a new donor registers, places a $10 donation, pays with a test card, and the EMS API records it', async ({
    page,
    ems,
    e2eEvent,
  }) => {
    test.setTimeout(180_000);
    const donor = newE2EDonor();
    const donorName = `${donor.firstName} ${donor.lastName}`;
    const amount = 1000;
    const before = await ems.reports.totals(e2eEvent.id);

    // 1. Choose the amount
    const donate = new DonatePage(page);
    await donate.goto();
    await donate.selectPresetAmount(amount);
    await donate.clickDonate();

    // 2. Register with a pre-authorised test card (no processing fee)
    await new LiteSignInPage(page).continueWithEmail(donor.email);
    const register = new LiteRegisterPage(page);
    await register.waitForPage();
    await register.fillDetails(donor);
    await register.fillCard(STRIPE_TEST_CARD, donorName);
    await register.setCoverProcessingFee(false);
    const guestId = await register.submit();
    await new OptInsPage(page).continueWithDefaults();

    // 3. Place the donation — totals move immediately, before payment
    const confirm = new ConfirmDonationPage(page);
    await confirm.waitForPage();
    await confirm.expectAmount(amount);
    const purchaseId = await confirm.placeDonation();
    await expect
      .poll(async () => (await ems.reports.totals(e2eEvent.id)).donation.raised - before.donation.raised, { timeout: 15_000 })
      .toBe(amount);

    // 4. Pay with the saved card, exactly $10.00
    const checkout = new CheckoutPage(page);
    await checkout.waitForPage();
    await checkout.setCoverProcessingFee(false);
    await checkout.expectTotalPayment(amount);
    await checkout.payWithSavedCard();
    await new PaymentConfirmationPage(page).expectSuccess(amount);

    // 5. Verify through the EMS API
    await expect
      .poll(
        async () =>
          (await ems.guests.paymentTransactions(e2eEvent.id, guestId))
            .filter((p) => p.status === 'paid')
            .reduce((sum, p) => sum + p.amount, 0),
        { timeout: 15_000 },
      )
      .toBe(amount);
    const [payment] = await ems.guests.paymentTransactions(e2eEvent.id, guestId);
    expect(payment).toMatchObject({ status: 'paid', processor: 'stripe', amount, cardLast4: '4242', currency: 'USD' });
    expect(payment.paymentTransactions).toContainEqual(
      expect.objectContaining({ recordType: 'donation', amountPaid: amount, paymentStatus: 'paid', itemPurchaseId: purchaseId }),
    );

    const outstanding = await ems.guests.checkout(e2eEvent.id, guestId);
    expect(outstanding.grandTotal).toBe(0);
    expect(outstanding.donations).toEqual([]);

    const rows = await ems.reports.donations(e2eEvent.id);
    expect(rows).toContainEqual(expect.objectContaining({ name: donorName, totalValue: amount, qty: 1 }));

    const after = await ems.reports.totals(e2eEvent.id);
    expect(after.donation.raised - before.donation.raised).toBe(amount);
    expect(after.donation.totalDonation - before.donation.totalDonation).toBe(1);
    expect(after.totalRaised - before.totalRaised).toBe(amount);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1`
Expected: FAIL — `Cannot find module '../../src/pages/lite/CheckoutPage'`.

- [ ] **Step 3: Create `src/pages/lite/CheckoutPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usd } from '../../utils/money';

/**
 * `?controller=guest&action=checkout` — "Checkout". This page polls
 * `checkout/selected` continuously, so it NEVER reaches `networkidle`; wait
 * for the "Pay with Card" button instead. The processing-fee toggle is a
 * hidden `<input name="applyPremiums">` inside a `<label class="switch">` —
 * click the label, like a user would.
 */
export class CheckoutPage extends LiteBasePage {
  readonly payWithCardButton = this.page.getByRole('button', { name: 'Pay with Card' });
  readonly confirmPaymentButton = this.page.getByRole('button', { name: 'Confirm Payment' });
  readonly cardListbox = this.page.getByRole('listbox', { name: 'Select card' });
  private readonly feeInput = this.page.locator('input[name="applyPremiums"]');
  private readonly feeSwitch = this.page.locator('label.switch:has(input[name="applyPremiums"])');

  async waitForPage(): Promise<void> {
    await this.payWithCardButton.waitFor({ timeout: 30_000 });
  }

  async setCoverProcessingFee(on: boolean): Promise<void> {
    if ((await this.feeInput.isChecked()) !== on) {
      await this.feeSwitch.click();
    }
    await expect(this.feeInput).toBeChecked({ checked: on });
  }

  /** e.g. "Total Payment $10.00" — with the fee off this equals the donation itself. */
  async expectTotalPayment(amountCents: number): Promise<void> {
    await expect(this.page.locator('main')).toContainText(`Total Payment $${usd(amountCents)}`);
  }

  /**
   * "Pay with Card" reveals the saved cards (pre-authorised at registration);
   * "Confirm Payment" charges it (POST .../guests/:id/payment → paymentStatus "paid")
   * and navigates to the confirmation page.
   */
  async payWithSavedCard(last4 = '4242'): Promise<void> {
    await this.payWithCardButton.click();
    await expect(this.cardListbox.getByRole('option', { name: new RegExp(`ending with ${last4}`) })).toBeVisible();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/lite\/v1\/events\/[^/]+\/guests\/[^/]+\/payment(\?|$)/.test(r.url()),
      ),
      this.confirmPaymentButton.click(),
    ]);
    const body = (await response.json()) as { code: string; message: string; entity: { paymentStatus: string } | null };
    if (body.code !== 'ok' || body.entity?.paymentStatus !== 'paid') {
      throw new Error(`Card payment failed: ${body.code}/${body.entity?.paymentStatus} — ${body.message}`);
    }
  }
}
```

- [ ] **Step 4: Create `src/pages/lite/PaymentConfirmationPage.ts`**

```ts
import { expect } from '@playwright/test';
import { LiteBasePage } from './LiteBasePage';
import { usdWhole } from '../../utils/money';

/**
 * `?controller=guest&action=confirmPayment` — "Thank You! Your payment has been
 * successful." Also offers "Download receipt" and "Set Up Donation" (recurring);
 * neither is ever clicked by tests.
 */
export class PaymentConfirmationPage extends LiteBasePage {
  readonly downloadReceiptButton = this.page.getByRole('button', { name: 'Download receipt' });

  async expectSuccess(amountCents: number): Promise<void> {
    await expect(this.page).toHaveURL(/action=confirmPayment/);
    const main = this.page.locator('main');
    await expect(main).toContainText('Thank You! Your payment has been successful.');
    await expect(main).toContainText(`Donation amount: $${usdWhole(amountCents)}`);
    await expect(main).toContainText(`Total payment: $${usdWhole(amountCents)}`);
    await expect(this.downloadReceiptButton).toBeVisible();
  }
}
```

- [ ] **Step 5: Run the full journey — twice, to prove repeatability**

Run: `npx playwright test --project=api-setup --project=lite-e2e --workers=1 && npx playwright test --project=api-setup --project=lite-e2e --workers=1`
Expected: `2 passed` both times (each run registers a fresh donor and adds exactly one $10 paid donation to the E2E event).

- [ ] **Step 6: Commit**

```bash
git add src/pages/lite/CheckoutPage.ts src/pages/lite/PaymentConfirmationPage.ts tests/e2e/donation.spec.ts
git commit -m "feat(lite): checkout + confirmation pages; complete donation journey verified via EMS API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Scripts, docs, and the full verification run

**Files:**
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run test:api`, `npm run test:e2e`, `npm run test:fundraising`, `npm run test:all`.

- [ ] **Step 1: Add the scripts**

In `package.json` `scripts`, keep `test`/`test:headed` exactly as they are and add:

```json
    "test:api": "playwright test --project=api-setup --project=api",
    "test:e2e": "playwright test --project=api-setup --project=lite-e2e --workers=1",
    "test:e2e:headed": "playwright test --project=api-setup --project=lite-e2e --workers=1 --headed",
    "test:fundraising": "npm run test:api && npm run test:e2e",
    "test:all": "npm test && npm run test:fundraising",
```

(`test:fundraising` is sequential on purpose: both projects read the same `reports/totals`.)

- [ ] **Step 2: Document the suite in `README.md`**

Under "## Running tests", after the existing block, add:

```markdown
### Fundraising (outcome) suite — donor journeys + API

```bash
npm run test:api          # EMS/Lite API tests (seconds; fully parallel; self-cleaning)
npm run test:e2e          # donor journeys on the public Lite UI, one worker
npm run test:fundraising  # both, api first (they share the same event totals)
npm run test:all          # checklist suite + fundraising suite
```

These run against a **separate, clean E2E event** (`E2E_EVENT_ID` /
`E2E_LITE_UI_BASE_URL` in `.env`) — never the checklist suite's
`TEST_EVENT_ID`, whose accumulating rows would keep moving the totals these
tests assert deltas on. Design: `docs/superpowers/specs/2026-09-06-fundraising-outcome-suite-design.md`.
```

Under "## Structure", extend the tree:

```
src/
  api/        - HttpClient + EmsApi (back office) + LiteApi (public) clients, typed responses
  pages/lite/ - Page Object Model classes for the public donor-facing Lite UI
  utils/      - money formatting (cents -> "$10" / "$10.00")
tests/
  setup/api.setup.ts - EMS API login; writes playwright/.auth/ems-token.json
  fixtures.ts        - `ems`, `lite`, `e2eEvent` fixtures for tests/api + tests/e2e
  api/               - pure HTTP tests (project `api`)
  e2e/               - Lite UI donor journeys verified via the EMS API (project `lite-e2e`)
```

Under "## Current coverage", add:

```markdown
- **Donations — donor journey (Lite UI + EMS API)** (`tests/e2e/donation.spec.ts`):
  a new donor picks the $10 preset, registers with a Stripe test card
  (processing fee off), places the donation, pays, sees the thank-you page;
  the EMS API then shows totals +$10, a paid Stripe transaction for that
  guest with the right purchase id, nothing outstanding, and a donation
  report row for the donor.
- **Donations — check-in API** (`tests/api/donations.api.spec.ts`): create →
  totals +$10 → cancel → totals restored; cancel is idempotent; zero amount →
  `invalid_amount`; unknown pledge / donation → 404 `notFound`; bad token → 401.
- **Public Lite API** (`tests/api/lite-public.api.spec.ts`): event takes Stripe
  card payments in USD; the donation item is active with the expected presets.
```

Under "### Testing gotchas worth knowing before extending this further", add a new sub-heading:

```markdown
#### Lite UI (public site) gotchas — from building the donation journey

- **Preset amount tiles are `<label role="radio">` whose `aria-checked` never
  changes** (selection is a `selected` CSS class). Playwright's `.check()`
  fails with "did not change its state" — `.click()` and assert the class.
- **Donors must sign in to donate, and the default is phone (SMS code).** The
  "Sign in via email" link leads to email + password registration, which is
  fully automatable — no code is ever sent. The form sits behind invisible
  reCAPTCHA Enterprise; headless Chromium passes it.
- **`@example.com` addresses are dropped at the edge (WAF) with a 502**, which
  the UI shows as "Oops! there are difficulties logging you in". Use
  `qa.e2e.donor+<seed>@givergy.com`. The site checks both email AND mobile for
  existing registrations, so derive both from the same per-run seed.
- **Registration and card pre-authorisation are one form.** Stripe Elements
  render card number / expiry / CVC in three iframes with distinct `title`s
  ("Secure card number input frame" etc.) — `frameLocator` by title, not by
  the `__privateStripeFrame…` name, which is shared by unrelated frames.
- **"Place Donation" counts toward `reports/totals` immediately, before any
  payment.** Payment is a separate checkout step. Assert on totals after
  placing, and on `guests/:id/payments/transactions` after paying.
- **The checkout page never reaches `networkidle`** — it polls
  `checkout/selected` forever. `goto(..., { waitUntil: 'domcontentloaded' })`
  and wait for "Pay with Card".
- **The processing-fee toggle is a hidden `<input name="applyPremiums">` inside
  `<label class="switch">`** — the input is off-screen, so click the label.
  Leaving it on adds 3.95% (e.g. $10.40), which breaks exact-amount asserts.
- **`reports/payments` stayed `paymentsTaken: 0` after a real Stripe payment**,
  so it is not used as an oracle; the per-guest `payments/transactions` list
  and `reports/totals` are.
- **`reports/donation` lists cancelled donations too** unless `status=ACTIVE`
  is passed, and its `totalCount` is always 0 — count `entity` rows instead.
- **Check-in `POST .../donations` returns HTTP 200 even when it rejects**
  (`code: "invalid_amount"`); only pledge/guest lookups fail with 404. It also
  accepted $5 on a pledge whose UI minimum is $10 — the minimum is enforced
  client-side only (worth raising with the product team).
```

- [ ] **Step 3: Full verification — both suites, from scratch**

Run: `rm -f playwright/.auth/ems-token.json && npm run test:all`
Expected: the checklist run reports `38 passed`; then `test:api` reports `11 passed` (1 setup + 3 reports + 2 lite-public + 5 donations); then `test:e2e` reports `2 passed` (1 setup + 1 journey). Total wall time ≈ 4 minutes. If anything is red, fix it before committing — do not commit a red suite.

- [ ] **Step 4: Confirm nothing secret is staged, then commit**

```bash
git add package.json README.md
git status --short   # only those two files; no .env, no playwright/.auth
git commit -m "docs+scripts: fundraising suite commands, coverage, and Lite UI gotchas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes (done while writing)

- **Spec coverage:** §4 architecture → Tasks 2–4, 6–7; §4.1 projects → Tasks 2–3; §4.2 client (envelope unwrap, descriptive errors, token file, fixtures) → Tasks 2–3; §4.3 page objects (LiteBasePage URL builder, Stripe frameLocator, intent-level methods) → Tasks 6–7; §5.1 delta pattern with `expect.poll` → Task 7; §5.2 API suite (happy, reversal, validation, unauthenticated, public reads) → Tasks 3–5; §5.3 data policy (accumulate E2E, API self-cleans, per-seed donor) → Tasks 5–6; §5.4 flake defences (poll, Stripe waits, one worker) → Tasks 3, 6, 7, 8; §6 config → Task 1; §7 unknowns — all five resolved by the 2026-09-06 exploration and encoded above. **Deviations from spec:** no custom-amount test (the event has none — `minimumOnly: true`); `reports/payments` dropped as an oracle (verified unreliable); "guest identity" resolved as email+password registration, not OTP.
- **Placeholders:** none — every step has its code or exact command and expected output.
- **Type consistency:** `EmsApi.reports.donations` (Tasks 2, 5, 7), `ems.guests.paymentTransactions/checkout` (Tasks 2, 7), `newE2EDonor`/`STRIPE_TEST_CARD` (Tasks 6, 7), `usd`/`usdWhole` (Tasks 1, 6, 7), fixture names `ems`/`lite`/`e2eEvent` (Tasks 3–7) all match. Task 8 Step 3's count: `test:api` = 1 setup + 3 + 2 + 5 = **11 passed**.
