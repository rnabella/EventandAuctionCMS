# Givergy QA Automation Platform

Playwright + TypeScript automation for the Givergy CMS and Lite UI, organized as a Page Object Model.

## A note on the shared test data

Tests write real data to a shared "Integration" test event (see `.env`), and
per the project's test data policy, most writes accumulate rather than reset
between runs (fixed values, so re-running is idempotent where the CMS allows
it; genuine "create a new X" actions like tickets/donors/auction items add a
fresh row every run). By the time all 8 checklist sections had automation
coverage, this event had accumulated enough rows (dozens to 100+ per entity
type) that list-heavy pages render noticeably slower and even time out —
`playwright.config.ts`'s test timeout is raised from the 30s default to 90s
as a safety margin, but the real fix is periodic cleanup:

```bash
npm run cleanup   # deletes accumulated test rows via each entity's own
                   # delete button + confirmation dialog — never a bulk
                   # "DELETE ALL" — see tests/maintenance/cleanup-test-data.spec.ts
```

Run it whenever the suite starts timing out, or periodically as maintenance.
It's a separate Playwright project (`maintenance`), deliberately excluded from
`npm test` since it performs real deletions — only runs when invoked directly.

**A more subtle consequence worth knowing**: once cleanup makes pages fast
again, a *pre-existing* race condition between tests that write to the same
underlying resource becomes far more likely to actually manifest (see
"Cross-test races" in Testing gotchas below) — slow pages were accidentally
spacing those tests out. If cleanup ever causes new failures, check there
first before assuming cleanup itself broke something.

## Setup

```bash
npm install
npx playwright install
cp .env.example .env   # then fill in real credentials/URLs
```

## Running tests

```bash
npm test              # checklist suite (setup + cms-auth + cms-chromium)
npm run test:headed   # headed (visible browser)
npm run test:ui       # Playwright UI mode
npm run report        # open the last HTML report
```

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

The pure-API donation tests (`tests/api/donations.api.spec.ts`) additionally
depend on `E2E_API_GUEST_ID` — a manual precondition, not something any setup
project creates. It must be a guest **registered on the E2E event with a card
pre-authorised**; it was created once by hand through the Lite UI registration
flow on 2026-09-06 ("QA E2E Donor 1335"). If it's ever deleted, the API
donation tests fail with a 404 `notFound`. To recreate it: run the Lite
registration flow once (the `lite-e2e` donor journey does exactly this, and
logs the new guest id in its trace) and paste the id into `.env`. A later
slice should have `api-setup` create this guest idempotently instead of
relying on a hand-created one.

## Structure

```
src/
  config/     - environment config loader (reads .env)
  pages/      - Page Object Model classes, one per CMS/Lite UI screen
    lite/     - Page Object Model classes for the public donor-facing Lite UI
  data/       - static test data / expected-state fixtures
  api/        - HttpClient + EmsApi (back office) + LiteApi (public) clients, typed responses
  utils/      - money formatting (cents -> "$10" / "$10.00")
tests/
  setup/             - auth setup project; logs in once and saves storageState
    api.setup.ts     - EMS API login; writes playwright/.auth/ems-token.json
  maintenance/       - cleanup tooling, run via `npm run cleanup` only (see above)
  cms/
    auth/            - login flow tests (run unauthenticated, no storageState)
    checklist/       - tests for authenticated CMS pages (use the saved storageState)
  fixtures.ts        - `ems`, `lite`, `e2eEvent` fixtures for tests/api + tests/e2e
  api/               - pure HTTP tests (project `api`)
  e2e/               - Lite UI donor journeys verified via the EMS API (project `lite-e2e`)
```

New authenticated CMS test suites go under `tests/cms/<section>/`, picked up
automatically by the `cms-chromium` Playwright project (depends on `setup`).
Tests that must exercise the login form itself go under `tests/cms/auth/`
instead, which intentionally starts with a clean, unauthenticated session.
If a new suite writes to a resource another suite also writes to (check for a
"save everything" cascade first — see "Cross-test races" below), put both in
one file under a `describe.serial` block rather than two separate files —
Playwright can't serialize across files.

## Current coverage

- **Authentication**: valid login, incorrect password
- **Checklist page** (`/events/:id/checklist/`): all 28 items across the 8
  sections render, Help links resolve, completion percentage matches checked
  items, and per-item navigation arrows land on the right CMS section
- **Website Details** (all 7 checklist items, under `tests/cms/website/`):
  - Website URL matches the configured Lite UI slug (read-only — see note below)
  - Social links save and persist
  - Theme colour saves and persists
  - Homepage video URL saves and persists
  - Header/footer navigation menu renders the expected default structure (read-only)
  - Sponsor "show after every N items" setting saves and persists
  - Event Page name and address save and persist
- **Ticketing** (all 5 checklist items, under `tests/cms/ticketing/`):
  - "Enable Pay Later on Website" setting saves and persists
  - Ticket details template renders the expected placeholders (read-only)
  - A new active ticket can be created and appears in the tickets list
  - A custom question can be added and persists
  - A promotion code can be added and persists
- **Auction Items** (all 4 checklist items, under `tests/cms/auction/`):
  - A new active auction item can be created (Campaign Items) and appears in the list
  - A Givergy catalog item can be added to the campaign (Givergy Items) and appears in Campaign Items
  - A new inventory item can be created for a donor (Inventory Items) and appears in the list
  - A donor can be created (Item Donor List) and selected, enabling the thank-you-send action (the send itself isn't triggered — see below)
- **Donations** (the 1 checklist item, under `tests/cms/donations/`):
  - Amount Label saves and persists
  - "Allow custom amount" toggle saves and persists
- **Payment Collection** (all 4 checklist items, under `tests/cms/payment/`):
  - Stripe account shows as connected and verified (read-only — real OAuth flow, out of scope)
  - "Allow donor tip or platform fee" saves and persists
  - DAFpay section renders with its expected fields (read-only — real EIN registry lookup, out of scope)
  - Receipt configuration renders with organisation details populated (read-only — enabling tax receipts requires a mandatory signature file upload)
- **Event Displays** (both checklist items, under `tests/cms/event-displays/`):
  - Theme colour saves and persists once a screen is selected
  - The "Event Display Preview" link (a real `<a target="_blank">`, not a button) exposes the shareable URL an onsite AV team would use
- **Notifications** (all 3 checklist items, under `tests/cms/notifications/`):
  - SMS keyword (Settings page) saves and persists
  - A system message's (e.g. "Forgotten Password") email subject saves and persists — "Test Message" is never clicked, it sends a real SMS/email
  - A custom notification can be saved as a draft and appears under the Drafts tab — "Schedule"/"Send Now"/"Test Message" are never clicked, all three have real-world sending side effects
- **Guests** (both checklist items, under `tests/cms/guests/`):
  - A new guest can be created and appears in the Guest List (CSV bulk upload deferred — file upload)
  - A table can be created, and a new guest can be assigned to it directly via the guest form's own "Table" field — this covers "add guests to their tables" without needing the separate Table Assignments page

**All 8 checklist sections (28 items total) now have automation coverage.**
This checklist is the CMS's own definition of "what a fully configured
campaign looks like" and is being used as the backlog for what gets automated
next, section by section (Fundraising Website → Ticketing → Auction Items →
Donations → Payment Collection → Event Displays → Notifications → Guests).

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
- **Tickets — donor journey (Lite UI + EMS API)** (`tests/e2e/tickets.spec.ts`):
  a new donor selects the $20 fixture ticket, registers with a Stripe test
  card, walks the 4-step booking wizard (booking details → "Add later" instead
  of assigning/sending tickets → both fee toggles off), pays exactly $20.00 and
  sees "Thank you for your order!"; the EMS API then shows a paid
  `ticket_purchase` transaction for that ticket, an empty basket, unchanged
  fundraising totals (tickets aren't counted there), and "My Tickets" lists
  the assigned ticket.
- **Tickets — check-in API** (`tests/api/tickets.api.spec.ts`): reserve → $20
  line in the guest basket → cancel → basket restored; `count: 0` → 422;
  unknown ticket / purchase → 404 `notFound`; the cancel-returns-500 bug
  (sc-98155) is pinned with `test.fail` so it flips visibly when fixed.
- **Ticket fixture** — `E2E_TICKET_ID` names a pre-created ticket; `api-setup`
  keeps it sellable through the iBid API (stock ≥ 100, sale end far future,
  active, visible) so the journey never hits "Sold Out" or an expired sale.
- **Silent auction — bid and outbid (Lite UI + EMS API)** (`tests/e2e/auction.spec.ts`):
  a new donor bids the $25 minimum on the fixture lot, registers with a Stripe
  test card, and the bid shows under My Activity's "Winning" tab; a second
  journey has the shared API guest bid first, then a new UI donor outbid them
  at the required $25 increment and become the new top bidder — both verified
  via the EMS bids report and the public Lite lots listing.
- **Buy It Now (Lite UI + EMS API)** (`tests/e2e/auction.spec.ts`): a new donor
  buys the $50 fixture lot outright, pays with a test card through the
  existing checkout flow, and the EMS API shows a paid purchase, an empty
  basket, and the amount counted in `reports/totals.buyItNow` (unlike tickets,
  buy-now purchases DO count toward fundraising totals).
- **Auction API** (`tests/api/lots.api.spec.ts`): bid placement respects the
  lot's minimum and increment rules (`below_minimum` / `below_increase` /
  `accepted`), cancel is idempotent (HTTP 200 even for an unknown id, unlike
  ticket cancellation), buy-now purchase/cancel, and sealed bidding masks only
  the bidder's name on the public site (`topBidName` → "Sealed Bid Item") —
  the amount/count fields are NOT zeroed, they're repurposed into a bid-count
  echo once any bid exists (e.g. `bidCount: 1`, `topBidAmount: 1`,
  `topBidAmountFormatted: "1 Bid Received"`); verified against a non-sealed lot
  with an identical bid, which shows the real values in all four fields.
- **Auction fixtures** — three permanent lots (`E2E_LOT_ID`, `E2E_BUYNOW_LOT_ID`,
  `E2E_SEALED_LOT_ID`), one per bid mode; `api-setup` keeps them active,
  visible, and far from their sale end via the iBid API.
- **GLI Raffle — purchase journey (Lite UI + EMS API)** (`tests/e2e/raffle.spec.ts`):
  a new donor selects the $10 "QA E2E Raffle" fixture entry, registers with a
  Stripe test card, purchases one entry, pays, and sees the thank-you page;
  the EMS API then shows a paid raffle purchase, an empty basket, and the
  amount/count reflected as deltas on `reports.totals.raffles.totalRaised`,
  `reports.totals.raffles.raffleEntries`, top-level `reports.totals.totalRaised`,
  and `reports.gliRaffleItems[].bought`/`totalRaised` for the fixture raffle.
- **GLI Raffle — API** (`tests/api/raffle.api.spec.ts`, 5 tests): the fixture
  raffle is active, $10/entry and in stock via the iBid API; it's listed
  correctly on the Lite public API with its bundle; `api-setup`'s sellability
  guarantee (stock ≥ 100, sale end > 30 days out) holds; and two access-control/
  validation cases this slice cannot exercise a real purchase for — creating a
  purchase with an unregistered device id is rejected with a real HTTP 403
  `{"code":"forbidden"}`, and cancelling an unknown purchase id returns a real
  HTTP 404 `{"code":"notFound"}` — see gotchas below for why the API suite can't
  create a real purchase itself (only the Lite UI e2e journey can).
- **GLI Raffle fixture** — `E2E_RAFFLE_ID` names a pre-created entry ($10/entry,
  "QA E2E Raffle"); `api-setup` keeps it sellable through the EMS iBid API
  via `ensureRaffleSellable` (mirrors `ensureTicketSellable`), never cancels
  purchases (follows the donations/tickets precedent, accumulating real fixture
  data), and the bundle purchase path (3 for $25) is deliberately out of scope.
- **Recurring Donations — setup journey (Lite UI + EMS API)**
  (`tests/e2e/recurring-donation.spec.ts`): a new donor picks the "Recurring"
  tab, selects Monthly + the $10 preset, registers with a Stripe test card
  (processing fee off), and clicks "Set Up Donation"; the subscription-creation
  response itself (`eventId`, `guestId`, `amount`, `recurringInterval: 'month'`,
  `recurringIntervalCount: 1`, `subscriptionStatus: 'active'`, `totalAmount: 0`,
  a real `sub_...` Stripe id) is the verification oracle, cross-checked against
  the EMS admin subscription search (`ems.subscriptions.list`), and the success
  page confirms "Donation: $10" / "Frequency: Monthly". The subscription is
  **always cancelled via a `test.afterEach` hook**, real or test-timeout
  failure alike — a stronger guarantee than the test body's own `finally`,
  since Playwright runs `afterEach` (with its own fresh timeout budget) even
  after a test-timeout teardown, when a body-local `finally` never resumes —
  see gotchas below for why this slice is the one exception to this project's
  "accumulate real fixture data" convention.
- **Recurring Donations admin API** (`EmsApi.subscriptions`,
  `tests/api/recurring-donations.api.spec.ts`, 2 tests): `list()` searches
  cross-event by guest name/email (`v1/iBid/clients/stripe-subscriptions/`,
  paginated, `subscription_status: 'active' | 'all'`) and `cancel()` cancels a
  real Stripe subscription (`PUT v1/iBid/events/:eventId/stripe-subscriptions/:id`).

### Known limitations / follow-up work

- Rich-text editors, image/logo uploads, the sponsor-creation modal, and the
  navigation menu's drag-and-drop add/reorder/remove flow are not yet
  automated — each `src/pages/cms/website/*.ts` file notes what it deliberately
  left out and why.
- The CMS "General Settings > Website url" field is intentionally read-only in
  tests: it's the live slug this project's `LITE_UI_BASE_URL` depends on.
- Tests that write data use fixed, deterministic values (fill the same value
  every run) rather than restoring previous state afterward — the shared
  Integration test event is expected to accumulate this test data over time.
  Tickets/Questions/Promotion Codes specifically always create a *new* row
  each run (there's no "edit existing" idempotent path like the Website
  Details cards), so the event will accumulate multiple near-identical
  tickets/questions/codes over repeated runs — expected, not a bug.
- Ticketing > Details' rich-text template content isn't rewritten, same
  reasoning as the Website Details Content page.
- Auction Items: CSV bulk-upload (Campaign Items, Inventory Items) and the
  bulk image upload cards aren't automated (file uploads). The "Send Donated
  Item Thank You" action is never actually clicked — it sends a real email —
  only that it becomes enabled once a donor is selected.
- Creating an inventory item and creating a Givergy-catalog-added item both
  create a *new* row every run, same accumulation policy as Tickets/Questions/
  Promotion Codes. Donors likewise accumulate (no dedup by name).
- Payment Collection: Stripe account connection (real OAuth), the DAF Pay
  EIN/Organisation lookup (real external registry search), and enabling tax
  receipts (requires a mandatory signature file upload) are all read-only
  checks rather than full CRUD, for the reasons above.
- `payments/daf/` — the URL the Checklist's "Set up the ability for DAF Pay"
  item's arrow navigates to via client-side routing — 404s on a direct/hard
  navigation. DAF Pay setup actually lives on the Settings page (or the
  Checklist page's "Add Now" banner/modal), not as its own routable page.
- Event Displays: both checklist items land on the same URL
  (`leaderboard/defaultScreensSettings/`) — a screen must be selected from a
  dropdown before any of its settings render. The "share with your AV team"
  item is covered by reading the "Event Display Preview" link's `href`
  (a real, shareable URL with `eventId`/`screenId` query params), not by
  loading the actual display page.
- Notifications: Email Header/Footer Image uploads aren't automated (file
  uploads). The custom-notification compose form's "Test Message", "Schedule",
  and "Send Now" actions are never clicked — each has a real-world sending
  side effect; only "Save as Draft" is exercised.
- Guests: CSV bulk guest upload isn't automated (file upload). No "Table
  Assignments" page automation — assigning a guest to a table via the guest
  creation form's own "Table" field is simpler and covers the checklist item
  just as well.
- **Ticket stock release is not asserted.** The check-in purchase result's
  `available`/`bought` fields are discarded and the iBid ticket is not
  re-read after cancel; `api-setup`'s `ensureTicketSellable` silently
  restocks the fixture below 100. A stock-leak regression would therefore be
  repaired every run rather than reported. Follow-up: probe how
  `available`/`bought` relate to `numberAvailable`, then pin it.
- **Tickets slice scope (deliberate):** promo codes, custom ticket questions,
  attendee assignment / ticket emails, Pay Later / Request Invoice, and
  add-on donations are not covered; the journey takes the "Add later" path
  and pays by saved card only.
- **Live auction bidding is out of scope permanently, not deferred** — it
  isn't a lot type this CMS supports at all (see the gotcha above), so there
  is nothing to test regardless of tooling or manual steps.
- **Closing the campaign, selling a lot, and the losing-bidder payment flow
  are out of scope** — the "Close Campaign" wizard's later steps charge cards
  and send emails for real, and both fundraising-suite events are reused on
  every run, so there is no disposable copy to safely close.

## Maintenance cleanup tool

`npm run cleanup` (see "A note on the shared test data" above) covers 9
entity types across 3 different delete UI patterns discovered on this app:

- **Row + confirm dialog** (Tickets, Campaign Items, Donors, Inventory Items,
  Guests, notification Drafts): click the row's trash icon, confirm via a
  dialog — but the exact confirm button wording differs per page ("YES,
  DELETE" vs "DELETE" vs "Delete"), and success toasts stack up and physically
  cover the next row's buttons if not dismissed between deletions.
- **Card + confirm dialog** (Tables): same idea, but the list is styled cards,
  not an HTML table.
- **Expand-then-delete** (Questions, Promotion Codes): click "Edit" to expand
  a row, click a trash icon (no accessible name — matched by its Material
  Design SVG path), confirm via a "CONFIRM" dialog — that only updates local
  form state, so the page's top-level "SAVE" must still be clicked to persist.

All three are implemented once as shared helpers on `BasePage`
(`deleteAllTableRowsMatching`, `deleteAllCardsMatching`,
`deleteAllExpandableRowsWithSave`) and reused by each page object's own
`deleteAllWith...` method. Not yet covered: none — Tickets, Auction Items
(created + added-from-catalog), Inventory Items, Donors, Drafts, Questions,
Promotion Codes, Guests, and Tables are all handled.

### Bugs found while building this

- **Branding > Colours**: the "Navbar Colour" and "Navbar Text Colour" fields
  on the Integration test event were blank, which silently blocks Save for the
  *entire* card (including unrelated fields like Theme Colour) with no visible
  error unless you inspect those two fields directly. Worked around in
  `BrandingPage.ts`; worth reporting to the product team.
- **Branding > Colours > Theme Colour**: its `<label for="themeColour">`
  doesn't match any element's `id` in the DOM — a real accessibility defect
  (the visible label isn't actually associated with its input). Worked around
  by selecting on `input[name="themeColour"]` instead of the label.
- **`checkin/v1/events/:id/reports/donation`'s `status` query parameter does
  nothing.** Passing `status=ACTIVE`, `status=CANCELLED`, a bogus value, or
  omitting it entirely all return the exact same rows, cancelled donations
  included — cancelling a donation correctly reverses `reports/totals` but
  never removes that donation's row from this report, no matter how long you
  poll (verified live over 30s). Worth reporting to the product team; worked
  around in the API test suite by asserting deltas on creation only and
  relying on `reports/totals` (which does behave correctly) to verify a
  cancellation, rather than expecting the report's row count to fall back down.
- **Check-in `ticketPurchases/cancel` returns HTTP 500 although the purchase is
  cancelled** (3/3 reproductions, server log IDs recorded) — filed as sc-98155.

### Testing gotchas worth knowing before extending this further

- List-style pages (Tickets, Questions, Promotion Codes) render their static
  chrome (Save/Create buttons) immediately, but fetch existing rows via a
  separate async request — `goto()` on those page objects waits for
  `networkidle`, not just a button becoming visible, or reads happen against
  stale/empty data. The Checklist page (built earlier) has the same shape of
  bug for the same reason.
- On these same pages, a **saved** row collapses into read-only text + an
  "Edit" link — it's only a live `<input>` while being added/edited. Verifying
  "did my write persist?" by re-querying `input[name=...].value` after a
  reload will incorrectly return false; check the rendered text instead.
- Some fields validate asynchronously on blur (e.g. Auction Item "Item
  Number" uniqueness) — clicking Save immediately after `.fill()` +`.blur()`
  can silently no-op (no request, no visible error) if the async check hasn't
  resolved yet. A short explicit wait after blur, before clicking Save, fixed
  it — annoying, but simpler than trying to await a signal the UI doesn't expose.
- An "auto-generated" field's default value (e.g. Item Number defaulting to
  "1" on every new item) is not necessarily unique — creating two items
  without giving each a fresh value causes a 409 conflict on the second one.
  Don't assume a form's own defaults are safe to re-run against.
- Don't gate success on a toast/snackbar staying visible after some other
  action (e.g. dismissing a confirmation dialog) — toasts can auto-dismiss
  before your code gets around to asserting on them, which reads as a failure
  even though the underlying action (confirmed via network logging) succeeded.
  Prefer asserting on the actual persisted outcome instead.
- Autocomplete-style fields (MUI `Autocomplete`) typically search once per
  `.fill()` rather than continuously — if the thing you're searching for was
  created moments earlier (e.g. by a concurrently-running test creating a
  same-named record), that one search can miss it. Retry the search a few
  times rather than trusting a single attempt when the target was just created.
- Not every settings page groups its fields into per-card `Save` buttons like
  Website Details/Ticketing do — Donations > Settings is one big page with a
  single page-level Save covering everything (Amounts/Target/Funds included),
  and its fields have no `<label for>`/id association at all (not even the
  broken container-id pattern from Theme Colour). Check whether a scoped card
  actually exists (and whether `getByLabel` resolves anything) before assuming
  either pattern — this page needed plain page-level, label-proximity locators
  throughout instead.
- **A card heading can be visually all-caps purely via CSS `text-transform`,
  while the actual DOM text is title case.** `SavableCard`'s heading match
  uses `exact: true` (case-sensitive) — copying the visual all-caps text from
  a screenshot into a new `SavableCard(...)` call will silently match nothing
  and every locator built from `.card` will hang until timeout. Always check
  the real DOM text (view-source or a saved HTML dump), not the rendered
  screenshot, before wiring up a new `SavableCard`.
- **Checking a "simple-looking" checkbox can reveal newly-required fields**,
  including file uploads (e.g. Payment Collection > Receipt Details' "Enable
  tax receipts" reveals a mandatory signature upload). Screenshot the page
  after toggling a checkbox, before assuming the rest of the save flow is as
  simple as the unchecked state suggested.
- **Not every clickable-looking control is a `<button>`.** Event Displays'
  "Event Display Preview" is a real `<a target="_blank">` link — `getByRole('button')`
  silently excludes it (it's `role=link`), so a button-based locator finds
  nothing while the element is clearly visible on screen. When a locator
  finds zero matches for something you can see, check the actual tag/role
  before assuming a timing or scoping problem.
- **Two cards on the same page can both have a button with the exact same
  accessible name** (Notifications > Settings has a "Save" for SMS/Email
  Settings *and* a separate "Save" for the Email Header/Footer Images card
  further down) — `getByRole('button', {name: 'Save', exact: true})` throws a
  strict-mode violation with 2 matches unless scoped or given `.first()`.
  Don't assume a button's accessible name is unique to the page just because
  it looks unique in a screenshot of one card.
- **A "compose" form can require picking a field from a section that looks
  unrelated to the fields already filled in** — the custom-notification form's
  Save/Schedule/Send buttons stayed disabled after selecting a mailing list
  and a template; the missing requirement was toggling on a send channel
  (Email or SMS) in a visually separate "Campaign Type" section. When a save
  button won't enable, check for *every* required field on the page, not just
  the ones nearest to what you already filled in.
- **A checkbox/switch's underlying `<input>` can be visually hidden as an
  implementation detail of the visible control** (MUI `Switch` renders a
  zero-visibility `<input type="checkbox" role="switch">` under a track/thumb
  UI). Calling `.check({force: true})` directly on that input intermittently
  failed with "Clicking the checkbox did not change its state" — clicking the
  visible `.MuiSwitch-root` wrapper instead, like a real user would, was
  reliable. Prefer clicking what's actually rendered over forcing a click on
  a hidden implementation element, even when the hidden element resolves and
  looks clickable in isolation.
- **A list can render as styled cards instead of an HTML `<table>`** — Guests'
  Table Plan list has no `<tr>` elements at all (Name/Number/Guests Assigned
  in a bordered card with action buttons), unlike the Guests List or Tickets
  list, which genuinely are tables. A `page.locator('tr', {hasText})` check
  silently returns 0 matches forever on a card-based list; verify the actual
  markup per page rather than assuming every "list" page shares one shape.

### Cross-test races (discovered 2026-09-02, via the maintenance cleanup tool)

Once `npm run cleanup` trimmed the accumulated test data, several previously-
reliable tests started failing intermittently — not because cleanup broke
anything, but because faster page loads let a **pre-existing race condition**
actually manifest: slow pages had been accidentally spacing these tests out
just enough to avoid it.

- **Shared "save everything" cascades.** Saving the Questions page also fires
  a save for *every existing ticket* (confirmed via network trace) — Tickets,
  Questions, Promotion Codes, and Ticket Settings all write through the same
  underlying "ticketing configuration". Two of these saving concurrently is a
  lost-update race: one test's save can silently overwrite another's
  freshly-written data with a stale snapshot it loaded first. Same mechanism
  for Campaign Items + Givergy Items (both write the same "lots" list) and
  Guest List + Table Assignment (both write the same guests list). Playwright
  can't serialize across separate files — only within one `describe.serial`
  block in a single file — so the fix was merging each racing group into one
  file: `ticketing-writes.spec.ts`, `campaign-items-writes.spec.ts`,
  `guests-writes.spec.ts`. Read-only tests (e.g. Ticketing > Details) don't
  need this — they can't lose an update they never make.
- **When a shared resource across pages is suspected, don't assume — verify
  by literally running the racing tests together with `--workers=1` and again
  with the default worker count.** Consistent failures only under real
  parallelism, that disappear under `--workers=1`, is the signature of this
  exact race — as opposed to a plain flake or a genuine bug, which fail
  either way.
- **Not every failure that looks like a race actually is one.** Two of the
  five failures that showed up alongside the confirmed races turned out to be
  unrelated, page-specific bugs that just needed the same "pages are faster
  now" trigger: `CustomNotificationsPage.gotoDraftsTab()` clicked the DRAFTS
  tab before it was interactive and silently stayed on SCHEDULED (fixed by
  asserting `aria-selected="true"` after the click, not just that the click
  happened); `CampaignItemsPage.goto()` didn't wait for the list refetch that
  dismissing the "Go to Settings or Campaign Items?" modal triggers (fixed
  with an extra `waitForLoadState('networkidle')` after dismissing it).
  Re-running the *same* test serialized against its "racing partner" and
  still seeing it fail is the tell that it isn't actually a race.
- **Success toasts can stack up and physically block the next action.**
  Deleting several rows in a tight loop (the cleanup tool) queued up multiple
  "Donor updated successfully!" toasts that never got a chance to
  auto-dismiss, eventually covering the very buttons the loop needed to click
  next ("intercepts pointer events"). Fixed by explicitly closing every
  visible toast (`aria-label="Close"`) before each iteration — don't assume
  a toast's own auto-dismiss timer is fast enough for a rapid automated loop.
- **A displayed value can be a raw ID instead of the human-readable name it
  usually resolves to, depending on record state.** The Guests List's "Table"
  column shows the assigned table's raw *number* (not its name) for guests
  still in a "NOT READY" status — the friendly name apparently resolves
  asynchronously. A check written against the name silently never matches;
  checking for the number (always available immediately) is more reliable.

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
- **`reports/donation`'s `status` filter has no effect at all** (verified
  live 2026-09-06: `ACTIVE`, `CANCELLED`, a bogus value, and omitting it
  entirely all return the identical rows) — it always lists cancelled
  donations alongside active ones, and cancelling never removes a row, however
  long you poll. `totalCount` is also always 0 — count `entity` rows instead,
  and page past the default `limit: 50` (`EmsApi.reports.allDonations`) since
  the event gains a row every run and old rows never drop off.
- **Check-in `POST .../donations` returns HTTP 200 even when it rejects**
  (`code: "invalid_amount"`); only pledge/guest lookups fail with 404. It also
  accepted $5 on a pledge whose UI minimum is $10 — the minimum is enforced
  client-side only (worth raising with the product team).
- **"Download receipt" on the confirmation page is an `<a>` link, not a
  button** — `getByRole('button', …)` finds nothing; use
  `getByRole('link', …)`. It is never clicked by tests.
- **The confirmation page's raw DOM text has no space after the colon**
  ("Donation amount:$10") even though the accessibility tree shows one —
  assert with a whitespace-tolerant, digit-anchored regex
  (`` `(?:Donation|Purchase) amount:\s*\$${usdWhole(amountCents)}(?!\d)` ``),
  not a literal string. The `(?:Donation|Purchase)` alternation was added for
  the raffle confirmation page, whose copy reads "Purchase amount:" instead —
  see the GLI Raffle gotchas below.
- **A ticket created through the CMS is "Sold Out" until you set its Limit** —
  `numberAvailable` defaults to 0 and the sale window to 24 hours. The
  fixture is repaired automatically by `api-setup` (`src/api/ticketFixture.ts`)
  via `POST /ems/v1/iBid/events/:e/tickets/:id` (send the record back minus
  `created`, `updated` and `ticketType`, which the server rejects).
- **Unpaid ticket reservations expire after ~10–15 minutes, and reloading the
  booking wizard resets it to Step 1** — never `page.reload()` mid-booking; pay
  in one pass.
- **Step 1's "Continue" is a sibling of its accordion region, not inside it**;
  Step 2's is inside. Step 3 hides everything behind two radios — click the
  visible label ("No, I'll assign all tickets myself"), then "Add later" books
  the ticket to the purchaser without emailing anyone.
- **Step 4 has two fee toggles** (`applyTicketBookingFees` $4.00,
  `applyPremiums` $0.95) and Step 1 has its own `applyPremiums` — scope to the
  Step 4 region or you hit a strict-mode clash. Both off → total $20.00.
- **Tickets don't appear in `reports/totals`** (no tickets bucket) — verify via
  `guests/:g/payments/transactions` (`recordType: "ticket_purchase"`, plus a
  zero `ticket_booking_fee` line) and the basket, not the totals.
- **Check-in `POST …/ticketPurchases` returns a bare array with HTTP 200 even
  on failure (`code: "soldOut"`)**; `…/ticketPurchases/cancel` returns HTTP
  500 but does cancel (sc-98155).
- **Step 4's fee-amount cells render blank for up to ~1.5 s and then settle to
  a nondeterministic default** (sometimes both fees on, sometimes off).
  `TicketBookingPage.setFees` waits for each amount cell to be non-empty
  before reading the toggle and asserts the cell's amount after toggling —
  read the amount cell, not the checkbox.
- **A lot's detail-page URL uses its short display number, not its UUID** —
  `?controller=lots&action=showLot&id=40706`, never the lot's `id` field from
  the API. Only the browse page's own links carry the right number; page
  objects open a lot by clicking its "Add … to Favourites" link rather than
  building the URL from an id the suite already has.
- **A lot's minimum-bid label text doesn't necessarily match its enforced
  minimum** — our fixture lots show "Minimum Bid $10" / "Next Minimum Bid $10"
  in the UI, but the API rejects anything below the lot's real
  `minStartPrice` ($25) with `code: "below_minimum"`. Don't assert on the
  label text as if it were the enforced value.
- **A bid never reaches a payment step; a Buy It Now purchase does** — placing
  a bid ends at the confirm-bid page (nothing is charged until the auction
  closes, out of this suite's scope); confirming a Buy It Now purchase
  navigates on to the ordinary `?controller=guest&action=checkout` page, the
  same one tickets and donations use.
- **`sealedMultiBidding` is not what makes a lot sealed** — that boolean field
  is unrelated. The real control is the lot's `bidMode` (`silent` / `hybrid` /
  `buy_now` / `sealed`), set by picking a "Type" in the CMS lot editor
  (options: Silent Auction, Silent + Max Bidding, Buy It Now, Sealed Bidding).
  There is no "Live" type — live-auction bidding isn't a feature this CMS
  exposes for silent-auction-based events at all (verified by reading the
  real save payload the CMS sends when changing this field: the enum has
  exactly those four values).
- **A sealed lot's public `bidCount`/`topBidAmount`/`topBidAmountFormatted`
  are NOT masked to zero** — only `topBidName` is masked (→ "Sealed Bid
  Item"). Once any bid exists, the other three fields instead echo the real
  bid count (e.g. `bidCount: 1`, `topBidAmount: 1`,
  `topBidAmountFormatted: "1 Bid Received"`). Don't assume "sealed" means
  "zeroed out" when reading the public Lite `lots()` response — check
  `topBidName` for the actual masking.
- **Bid/buy-now cancellation is idempotent; ticket cancellation is not** —
  `bids/cancel` and `buyNowPurchases/cancel` both return HTTP 200 even for an
  already-cancelled or unknown id, unlike `ticketPurchases/cancel`, which
  404s on an unknown id (and separately, sc-98155, 500s on cancelling a real
  one). Don't assume every `.../cancel` endpoint in this API behaves the same
  way — check each one.

#### GLI Raffle (Lite UI + API) gotchas

- **Three similarly-named features are easy to conflate:** Silent Auction
  (`controller=lots`, `items/lots`), Raffle (`controller=gliRaffles`,
  GLI-licensed with `bundles`/`raffleMode`/`licenceNumber`), and Prize Draw
  (`controller=raffles`, a separate not-yet-built feature with its own
  `prizeDrawPurchases` guest endpoint). Searching for "raffle" in the codebase
  or API docs can return hits from all three — always verify the endpoint path
  and the fixture's `controller` value before assuming you have the right
  resource.
- **GLI raffle purchases cannot be created via the check-in API the way
  tickets/bids/buy-now can.** `POST checkin/v1/events/:eventId/guests/:guestId/gliRafflePurchases`
  requires a `deviceId` for a device registered to the event. Any id this suite
  has access to (e.g. a generated UUID, or a value from the public API) is
  rejected with a real HTTP 403 and `{"code":"forbidden","message":"Forbidden access"}`.
  There is no discoverable API to obtain a valid device id. Consequently only
  the Lite UI (the e2e spec) can create a real raffle purchase; the API suite
  covers fixture sellability, the Lite public API's shape, and this access-control
  behavior instead.
- **`items/gliRaffles[].bought` never reverses on cancel; `totalRaised` and
  `prizePot` do.** This is the same permanent-counter / reversible-total split
  seen with tickets' `itemsSold`, but it appears on the SAME endpoint here,
  which is easy to assert the wrong field against after a cancel. Always
  double-check which field you're asserting against when verifying cancel
  side-effects.
- **This slice deliberately never cancels its e2e purchase.** It follows the
  donations/tickets precedent (accumulate real fixture data + delta-assert on
  `reports.totals`/`reports.gliRaffleItems`), not the silent-auction precedent
  (single shared fixture that must be reset between runs). A future contributor
  should not "fix" this by adding a cancel that isn't needed — it would break
  the fixture for the next run and leave the event in a dirty state.
- **`PaymentConfirmationPage.expectSuccess()` hardcoded "Donation amount:" in
  its verification regex**, which didn't match the raffle confirmation page's
  actual copy ("Purchase amount:"). Fixed by generalizing the regex to
  `(?:Donation|Purchase) amount:` — backward compatible, existing donation
  and ticket specs unaffected. Similar label-text assumptions in other
  confirmation or report pages should be rechecked when adding new payment
  types.

#### Recurring Donations (Lite UI + EMS API) gotchas

- **Setting up a subscription creates zero payment transactions and moves no
  totals.** Unlike every other slice, "Set Up Donation" doesn't charge
  anything — the created record's own `totalAmount` is `0`, and the first real
  charge lands on `firstBillingDate`, always a few days out. Verify against
  the subscription-creation response (and `ems.subscriptions.list`) directly;
  `reports/totals` and `guests/:id/payments/transactions` won't show anything
  yet and are the wrong oracle here.
- **This is the only slice that MUST cancel after every e2e run, real Stripe
  billing reasons rather than a shared-fixture-reset concern.** The auction
  slice's cancel discipline exists to keep one shared lot's bid state clean
  between runs; this one exists because an uncancelled subscription is a real
  Stripe subscription that keeps attempting to charge the test card on its
  real billing schedule for up to ~3 years — that window comes from
  `cancelAt`'s **default value** (+3 years from creation), independent of
  which frequency (Bi-weekly, Monthly, Every 3 Months, Every 6 Months, Every
  Year) was chosen — not a test-data cosmetic issue, an ongoing real-world
  side effect. `recurring-donation.spec.ts` guarantees cancellation via a
  `test.afterEach` hook (not the test body's own `finally`, which Playwright
  skips after a test-timeout teardown) that cancels the recorded subscription
  and, independently, sweeps for any subscription created under this run's
  donor last name that was never locally observed, logging the record id and
  Stripe id loudly on failure so a human can clean up by hand if the
  automated cancel itself fails.
- **There is no event-scoped check-in API for subscriptions at all** — no
  `checkin/v1/events/:eventId/guests/:guestId/subscriptions` endpoint exists
  the way donations/tickets/bids/raffle purchases have one. Verification is
  limited to the creation response itself, or the cross-event admin search
  endpoint (`v1/iBid/clients/stripe-subscriptions/`, `EmsApi.subscriptions.list`)
  — which is NOT scoped by event in its URL; filter client-side on the
  returned `eventId` (the spec searches by `q: donor.lastName` and asserts
  `eventId` in the result rows instead).
- **Cancel is real but eventually-consistent in the list.** A cancelled
  subscription can still show `subscriptionStatus: "active"` in
  `subscriptions.list()` for a short window afterward — 3 subscriptions
  cancelled during exploration on 2026-09-12 still showed `active` with no
  observed self-correcting window. Don't assert on that field flipping
  synchronously after calling `cancel`. To independently prove a cancel
  genuinely worked (rather than trusting `list()`), retry `cancel` on the same
  record: on an already-cancelled real subscription this returns HTTP 404 with
  **Stripe's own passthrough error**, e.g. `{"code":"Not Found","message":"No
  such subscription: 'sub_...'; code: resource_missing; request-id: req_..."}`
  — Stripe itself confirming the underlying subscription is gone, not an
  EMS-local flag check. Verified live 2026-09-12 and again 2026-09-15 across 5
  separate real subscriptions, 5/5 consistent. (An earlier working note
  assumed the generic EMS shape `{code:"notFound", message:"Subscription not
  found"}` instead — that shape wasn't observed against any real,
  previously-active record; it may only occur for an id that was never valid
  to begin with. See `EmsApi.ts`'s `subscriptions.cancel` docblock.)
- **The CMS has a whole top-level "REGULAR GIVING" nav section**, a sibling to
  "CAMPAIGNS" rather than something nested under a specific event — a
  cross-event admin view of every subscription with search plus a cancel (✕)
  action per row. Worth knowing about for anyone debugging this feature by
  hand; it's the human-facing equivalent of `EmsApi.subscriptions`.
- **The frequency dropdown isn't a `<select>`, but it exposes stable, robust
  ARIA regardless.** The plan flagged "click the current value's text to open
  it" as a fragile fallback locator strategy going in. In practice the
  dropdown's trigger is simply the page's only `div[role="combobox"]`, and
  opening it reveals a `role="listbox"` (`aria-label="Frequency options"`) of
  `role="option"` children — both roles hold no matter which value is
  currently selected (verified live 2026-09-12 by selecting "Monthly" then
  re-opening to switch to "Bi-weekly"). `DonatePage.selectFrequency()` uses
  `getByRole('combobox')` + the listbox's accessible name, never the
  current-value-text trick.
