# Fundraising Outcome Suite — Design

**Date:** 2026-09-06
**Status:** Approved in discussion, pending written review
**Scope:** New UI + API test layers covering the donor-side ("outcome") journeys of a Givergy campaign, alongside the existing organiser-side CMS checklist suite.

## 1. Why

The existing suite (38 tests, `npm test`) proves an organiser can **configure** a campaign: every CMS Checklist item's form saves, every list accepts a new row. Nothing in it ever donates, buys a ticket, or bids — the **fundraising outcome** side has zero coverage, on either the public Lite UI or the API.

This suite closes that gap with two new layers:

- **UI** — a donor's journey on the public Lite UI site, through Stripe test-mode checkout.
- **API** — the EMS back-office API (`/ems`) and the public Lite backend (`/lite`), both as a verification oracle for UI journeys and as a test subject in its own right.

## 2. Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Stripe | Test mode on Integration; test card `4242 4242 4242 4242` | Confirmed by user — no real money moves, so journeys can complete payment |
| Coverage | All fundraising types, donations first | User: "all of them"; donations is the complete vertical slice that proves the architecture |
| UI/API relationship | Approach A: hybrid E2E (UI act → API verify) **plus** standalone API suite | Only option delivering both layers as real coverage; API verification is faster and less flaky than re-reading CMS report screens |
| Events | **Two events.** Checklist suite stays on `9754d4fb-88f5-11f1-a08c-f68364a05a4e` (`robtestcampaigneventautomationus1`); fundraising suite gets the new, empty `5a5bef87-a9e7-11f1-90d8-92b18db85c99` (`robteste2eauto1`) | Checklist tests deliberately accumulate rows (lots, tickets, guests). Sharing an event would keep moving the very totals the fundraising suite measures |
| Runner / language | Playwright + TypeScript, Page Object Model, `APIRequestContext` for HTTP | Matches existing project; no new dependencies |

## 3. Environment facts (verified 2026-09-06)

- **EMS API**: `https://us.test.givergy.com/ems`. `POST checkin/v1/auth/login` with `{ username, password, version: 0 }` → `{ id, role, fullName, twoFactorRequired: false, authToken }`. `authToken` is used as `Authorization: Bearer <token>`. Same admin credentials as the CMS (`CMS_USERNAME` / `CMS_PASSWORD`).
- **EMS reports** (all `GET checkin/v1/events/:eventId/reports/...`, envelope `{ code: "ok", message, extra, entity, totalCount }`):
  - `totals` → `entity.{ totalRaised, charityProfit, silentAuction{totalItems,itemsSold,raised}, liveAuction{...}, buyItNow{...}, donation{totalDonation,raised}, raffles{totalItems,raffleEntries,jackpotEntries,prizeEntries,totalRaised,prizePot} }` — amounts in **minor units (cents)**.
  - `donation?offset&limit` → `entity: [...]` list of donations.
  - `bids`, `payments`, `guests/stats`, `guests/top`, `tables/*`.
- **EMS check-in actions** (`POST checkin/v1/events/:eventId/guests/:guestId/...`): `donations` `{ pledgeId, amount, anonymous, showPopup }`, `donations/cancel`, `bids` `{ lotId, amount, anonymous, showPopup, liveTAndCAccepted, autoSell }`, `bids/cancel`, `gliRafflePurchases` `{ gliRaffleId, bundleId, count, deviceId }` + `/cancel`, `buyNowPurchases/cancel`, `prizeDrawPurchases/cancel`, `ticketPurchases/cancel`, `payments/transactions`, `payments/checkout`.
- **EMS fixture endpoints** (`v1/iBid/events/:eventId/...`): `POST lots`, `POST lots/:lotId`, `POST gli-raffles`, `PATCH gli-raffles/:raffleId`, `GET/POST guests/:guestId`.
- **Lite public API**: `https://us.test.givergy.com/lite/v1/events/:eventId/...` — unauthenticated reads used by the public site itself: `` (event config incl. `paymentEnabled`, `pledgeOnLite`, `bidOnLite`, `buyNowOnLite`, `gliRaffleEnabled`, `currencyCode`), `pledges/campaignItem` (the donation item with its preset `amounts[]`), `lots`, `livelots`, `tickets?showHidden=false`, `raffles`, `gli-raffles`, `totaliser`.
- **Lite UI**: `https://us.test.givergy.com/robteste2eauto1/` — loads directly (no holding-page code). Routing is query-string based: `?controller=<c>&action=<a>`:
  - `pledges&action=campaignPledge` donate (`&activeTab=recurring-donation` for recurring)
  - `tickets` buy tickets
  - `lots&category=All%20Lots` silent auction; `lots&action=showLot&id=<n>` a lot
  - `liveLots` live auction; `raffles` prize draw; `gliRaffles` raffle
  - `guest&action=checkout` basket/checkout; `guest&action=checkRegistration` sign in; `guest` my account
  - `myBids&action=winning` my activity; `myBids&action=tickets` my tickets
- **New event state**: one active Donations pledge item (`5fdd8b4d-a9e7-11f1-90d8-92b18db85c99`) with preset amounts $10 / $50 / $100 / $250 / $1,000 (`allowRecurring: true`); **0** tickets, lots, live lots, raffles, GLI raffles, buy-now items; `$0` raised.

## 4. Architecture

```
src/
  config/env.ts            + env.e2e { eventId, liteUiBaseUrl }, env.api { emsBaseUrl, liteBaseUrl }
  api/
    http.ts                thin wrapper over APIRequestContext: base URL, JSON, bearer, envelope unwrap, error surfacing
    types.ts               response models (Totals, DonationReportRow, PledgeItem, Lot, Ticket, GliRaffle, ...)
    EmsApi.ts              login(); reports.*; checkin.*; fixtures.*
    LiteApi.ts             event(); pledgeItem(); lots(); tickets(); gliRaffles(); raffles(); totaliser()
    auth.ts                load/save playwright/.auth/ems-token.json
  pages/lite/
    LiteBasePage.ts        goto(controller, action?, params?) ; shared header/nav; toast/dialog helpers
    LiteHomePage.ts
    DonatePage.ts          preset amount tiles, custom amount, recurring tab, "Donate" CTA
    GuestDetailsPage.ts    donor identity step (name/email/phone, registration or sign-in)
    PaymentPage.ts         Stripe Elements via frameLocator; test card; pay
    ConfirmationPage.ts    thank-you / success state
    (later) TicketsPage, SilentAuctionPage, LotPage, RafflePage, PrizeDrawPage, CheckoutPage, MyActivityPage
tests/
  setup/api.setup.ts       EMS login → token file; idempotent fixture creation for later slices
  e2e/                     lite-e2e journeys, one spec per fundraising type
  api/                     pure API tests, one spec per fundraising type
```

### 4.1 Playwright projects (added to `playwright.config.ts`)

| Project | testDir / match | Depends on | Workers | Purpose |
|---|---|---|---|---|
| `api-setup` | `tests/setup/api.setup.ts` | — | — | EMS login → `playwright/.auth/ems-token.json`; ensure fixtures exist |
| `lite-e2e` | `tests/e2e/` | `api-setup` | **1** (`fullyParallel: false`) | Donor journeys; serial because they all move the same event totals |
| `api` | `tests/api/` | `api-setup` | default | Endpoint tests; fully parallel, each test owns its own data |

`npm test` is **unchanged** (checklist only). New scripts: `test:e2e`, `test:api`, `test:fundraising` (both), and `test:all` (checklist + fundraising).

### 4.2 API client design

- `EmsApi` and `LiteApi` are constructed from a Playwright `APIRequestContext` (`request` fixture or `playwright.request.newContext()`), so they work inside UI tests, API tests, and setup projects identically.
- Every call returns the unwrapped `entity` (typed) and throws a descriptive error (method, URL, status, `code`/`message` from the envelope) on non-2xx or `code !== "ok"`. Tests never parse envelopes.
- Auth token is read from `playwright/.auth/ems-token.json` (written by `api-setup`); already gitignored via `playwright/.auth/`.
- Custom fixtures in `tests/fixtures.ts`: `ems` (authenticated `EmsApi`), `lite` (`LiteApi`), `e2eEvent` (ids/urls), plus a `totalsDelta()` helper that snapshots `reports/totals` and later asserts exact deltas.

### 4.3 Lite page objects

- Extend the existing `BasePage` where its helpers apply; a `LiteBasePage` adds `goto(controller, action?, params?)` building `${E2E_LITE_UI_BASE_URL}/?controller=…&action=…&tabletMode=false`.
- Stripe card fields are inside iframes → `page.frameLocator('iframe[name^="__privateStripeFrame"]')` (exact selector confirmed during slice-1 exploration). Test card `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
- Page objects expose intent-level methods (`selectPresetAmount(5000)`, `enterCustomAmount(1234)`, `payWithTestCard()`), not raw locators, consistent with the CMS page objects.

## 5. Test design

### 5.1 E2E journey pattern (`tests/e2e/*.spec.ts`)

```
const before = await ems.reports.totals(e2eEvent.id);
// act as a donor in the browser: choose amount → details → Stripe test card → confirmation
await expect.poll(() => ems.reports.totals(e2eEvent.id).then(t => t.donation.raised - before.donation.raised)).toBe(5000);
const rows = await ems.reports.donation(e2eEvent.id, { limit: 20 });
expect(rows).toContainEqual(expect.objectContaining({ amount: 5000 /* + donor identity */ }));
```

- **Delta-based** assertions: accumulated history on the event never matters, only this test's change.
- `expect.poll` with a short budget (≈15 s) for payment → report propagation.
- Each journey is a single `test()` (one donor, one payment); UI intermediate states (confirmation screen) are asserted too so a UI break is reported as such rather than as a totals mismatch.

### 5.2 API suite pattern (`tests/api/*.spec.ts`)

Per fundraising type, against the E2E event:
- **Happy path**: create via check-in API (e.g. `makeDonation` for a known guest) → appears in the relevant report → totals delta correct.
- **Reversal**: `cancel` → report/totals return to baseline. (Tests reverse their own writes, so the API suite is self-cleaning.)
- **Validation**: invalid amount (0 / negative / below minimum), unknown `pledgeId`/`lotId`, unauthenticated (401), wrong event (403/404) — asserting status and `code`.
- **Public Lite reads**: `pledges/campaignItem` amounts match what the UI shows; `lots`/`tickets`/`gli-raffles` reflect fixtures.

Guest identity for check-in actions: a dedicated QA guest on the E2E event, created once by `api-setup` (via `iBid/.../guests` or the existing CMS `GuestsPage`), id stored alongside the token file.

### 5.3 Test data & accumulation policy

- **E2E donations/purchases are real test-Stripe transactions and are left on the event** (same accumulate-don't-restore policy as the checklist suite). Volume is small (one payment per journey per run).
- **API tests cancel what they create.**
- **Donor identity**: a fixed QA donor name; email pattern `qa-e2e-donor+<timestamp>@givergy.com` if the Lite UI requires unique registrations, or a single fixed email if it allows repeat purchases. **Resolved in slice-1 exploration** (see §7).
- **Fixtures for later slices** are created **idempotently** by `api-setup` (skip if an item with the QA marker name already exists): lots and GLI raffles via `iBid` API; tickets via the existing CMS `TicketsPage` page object pointed at the E2E event (no create-ticket endpoint in the collection); prize-draw ("raffles") and buy-now via CMS page objects or API once explored.
- Cleanup: the existing `npm run cleanup` gains an E2E-event step later **only if** volume becomes a problem; not in initial scope.

### 5.4 Error handling / flake defences

- Totals reads: `expect.poll`, never a single read.
- Stripe: wait for the iframe(s) to attach and the card input to be editable before typing; after "Pay", wait for navigation/confirmation rather than a toast.
- `lite-e2e` runs with one worker so two journeys can never interleave their totals snapshots.
- API client surfaces `code`/`message` on failure so a 4xx from the backend reads as the backend's reason, not a JSON parse error.

## 6. Configuration changes

`.env.example` (and the local `.env`):

```
# Fundraising / outcome suite — dedicated, clean event (never used by the checklist suite)
E2E_EVENT_ID=5a5bef87-a9e7-11f1-90d8-92b18db85c99
E2E_LITE_UI_BASE_URL=https://us.test.givergy.com/robteste2eauto1

# APIs (same host as the UIs)
EMS_API_BASE_URL=https://us.test.givergy.com/ems
LITE_API_BASE_URL=https://us.test.givergy.com/lite
```

`CMS_USERNAME`/`CMS_PASSWORD` are reused for API login. Existing variables are unchanged.

## 7. Known unknowns (resolve by exploration at the start of slice 1, not by guessing)

1. Whether the Lite UI donate flow requires donor registration/sign-in (and whether that sends an email/OTP), or accepts guest checkout with name + email.
2. Exact Stripe Elements iframe structure on this site (single Payment Element vs separate card/expiry/CVC frames).
3. Shape of a `reports/donation` row (fields for donor name/email/amount/status) — list was empty on both events at exploration time.
4. Whether the check-in `makeDonation` for a guest creates a *paid* donation or a *pledge awaiting payment*, and how that shows in totals (`donation.raised` vs `totalDonation`).
5. Report propagation latency after a Stripe payment (sets the `expect.poll` budget).

Each is answered with a throwaway explore script (scratchpad), findings recorded in the README "Testing gotchas" section as with every previous section.

## 8. Slice plan

1. **Donations** — config + `EmsApi`/`LiteApi` + `api-setup` + Lite page objects (Home, Donate, GuestDetails, Payment, Confirmation) + `tests/e2e/donation.spec.ts` (preset amount; custom amount) + `tests/api/donations.api.spec.ts` (make / verify / cancel / invalid / unauthenticated / pledge-item read). **Proves the whole architecture.**
2. **Tickets** — fixture ticket(s) via CMS `TicketsPage`; buy ticket journey (incl. custom question, promo code); `ticketPurchases/cancel` API.
3. **Silent auction** — fixture lots via `iBid lots`; place bid journey; outbid; `bids` / `bids/cancel` API + `reports/bids`.
4. **Raffle (GLI)** — fixture via `iBid gli-raffles`; buy raffle tickets journey; `gliRafflePurchases` API.
5. **Prize draw** — fixture via CMS/API (explore); purchase journey; `prizeDrawPurchases/cancel`.
6. **Buy Now** — buy-now lot fixture; purchase journey; `buyNowPurchases/cancel`.
7. **Recurring donations** — recurring tab journey (subscription in test Stripe); verify via reports.

Slices 2–7 each add: page object(s), one e2e spec, one api spec, fixture creation in `api-setup`, README coverage + gotchas. Same template as slice 1.

## 9. Out of scope

- Live auction bidding (needs an operator-driven live session), CSV/file uploads, real emails/SMS (never click "send"), Stripe onboarding, DAF Pay (external registry), CI/CD wiring (separate piece of work — GitHub Actions already decided).
