# Contributing

This is a living QA automation project — multiple engineers (any mix of junior/mid/senior QA/SDET) are expected to add coverage over time. This doc is the process: how to set up, how to branch, what has to pass before a PR merges, and how to add a new feature area consistently with what's already here.

## Setup

```bash
npm ci
npx playwright install chromium
cp .env.example .env   # fill in real credentials — ask a teammate, never commit this file
```

`npm run typecheck` should pass with zero errors on a fresh checkout before you touch anything. If it doesn't, that's a broken `main` — flag it before building on top of it.

## Before opening a PR

Run this locally — it's exactly what CI checks, so there are no surprises:

```bash
npm run ci        # typecheck + lint + format check
```

If `npm run lint` reports fixable issues, `npm run lint:fix` handles most of them. If `npm run format:check` fails, `npm run format` fixes it.

**Then run whichever test suites your change actually touches.** These are NOT part of automatic CI (see [Why the test suites aren't in CI](#why-the-test-suites-arent-in-ci) below) — running them locally before opening a PR is part of the process, not optional:

- Touched anything under `tests/cms/` or `src/pages/cms/`: `npm test`
- Touched anything under `tests/api/`, `tests/e2e/`, or `src/api/`/`src/pages/lite/`: `npm run test:fundraising`
- Unsure: run both (`npm run test:all`, also called the regression suite — `npm run test:regression` is an alias)

For a fast sanity check while iterating locally (not a substitute for the suite(s) above before opening a PR): `npm run test:smoke`.

A pre-existing, documented flake or two is expected (see README's "Testing gotchas" section) — if something new and unrelated to your change fails, investigate before assuming it's pre-existing; don't wave it away without checking.

## Branching and PRs

- One branch per feature/fix, branched from `main`: `feature/<short-name>` for new coverage, `fix/<short-name>` for a bug fix, `chore/<short-name>` for tooling/infra. Match the existing history (`git log --oneline`) for the naming pattern in practice.
- Never commit straight to `main`. Every change — including a one-line doc fix — goes through a PR, so there's always a reviewable diff and a CI run tied to it.
- Keep commit messages in the established `type(scope): summary` form (`feat(lite): ...`, `fix(api): ...`, `docs: ...`, `test(api): ...`, `chore: ...`). Look at `git log` for real examples before your first commit — the scope in parens is the area touched (`api`, `lite`, `cms`, or omitted for repo-wide changes).
- Rebase or merge `main` into your branch before opening the PR if it's gone stale; don't let a PR sit long enough to drift far from `main`.
- CI (typecheck + lint + format) must be green before merge. A red PR doesn't get merged "to fix later" — fix it or don't merge.
- Merge preference: this repo's history is fast-forward, linear merges (no squashing) — each commit in your branch should already be a coherent, reviewable unit on its own, not "wip" / "fix typo" noise. Clean up your branch's commits before opening the PR if they don't read that way yet.

## Adding a new feature area ("slice")

Every existing area (donations, tickets, silent auction / buy-now / sealed bidding, GLI raffle, recurring donations) followed the same shape — copy it:

1. **Verify live first, write second.** Every endpoint shape, locator, and edge case in this codebase was confirmed against the real Integration environment before being written into a test — never guess a payload shape or a button's accessible name from memory or documentation alone. Where a past attempt was wrong (see README gotchas for examples — sealed-bidding masking, a docblock's proof-of-cancellation claim), it was wrong because someone took a single, uncontrolled read as fact instead of polling/repeating. Don't repeat that mistake.
2. **Extend the typed clients, don't bypass them.** New endpoints go into `src/api/EmsApi.ts` / `src/api/LiteApi.ts` with real response types in `src/api/types.ts` (verified live), not raw fetches scattered through test files.
3. **Page objects, not locators-in-tests.** New UI surfaces get a page object under `src/pages/lite/` (or `src/pages/cms/` for CMS-side work), following `LiteBasePage`'s pattern. A test file should read like a user journey, not a locator dump.
4. **Two spec files per slice**, matching the existing pairs (`tests/api/<feature>.api.spec.ts`, `tests/e2e/<feature>.spec.ts`): a fast, parallel API-only suite for validation/edge cases, and a slower, serial full-journey e2e test through the real UI with a real Stripe test-card payment where applicable.
5. **Self-cleaning, always.** Every test that creates real data must remove it — cancel a bid/purchase/subscription in a `finally` (or, if a test-timeout could skip a body-local `finally`, in `afterEach` instead — see `tests/e2e/recurring-donation.spec.ts` for why that distinction mattered for a real-money-adjacent feature). A test that leaves stray state behind breaks every test that runs after it against the same shared fixtures.
6. **Document what you found**, not just what you built: add a "gotchas" entry to `README.md` for anything surprising or easy to get wrong (a masking behavior, a field that means something different than its name suggests, a race condition and its fix). Future contributors — including future you — read these before making the same mistake. Most new slices won't need a new `@smoke` tag (README's "Smoke suite" already covers login/checklist/CMS-write/API-read sanity with 7 tests) — only add one if the slice introduces a genuinely new fundamental dependency, to prevent smoke scope creep.

## Code review expectations

A reviewer should be checking, roughly in this order:
1. Does the test actually exercise the real thing (live API/UI), not a guess or a mock?
2. Is cleanup guaranteed, including on the failure path?
3. Does a shared fixture/guest/event get raced by this test running in parallel with others? (Check `tests/fixtures.ts` and the README's "Cross-test races" section for the established patterns to avoid this.)
4. Does it follow the existing page-object / typed-client pattern, or does it bypass it?
5. Is anything here undocumented that a later contributor would trip over?

## Why the test suites aren't in CI

`npm test` and `npm run test:fundraising` run against a real, shared Integration environment — there's no mocked backend. Wiring the full suite into automatic CI (on every push) would mean real test data, real Stripe test-mode charges/subscriptions, and races against anyone else running tests locally, firing on every commit. CI currently runs only the static checks (typecheck/lint/format) that have no side effects. If the team wants scheduled or manual-trigger live-suite runs in CI later, that's a deliberate follow-up decision (credentials would need to go into GitHub Actions secrets) — not something to add casually.

## Recommended (not yet enforced) repo settings

Ask whoever administers the GitHub repo to turn on, under **Settings → Branches → Branch protection rules** for `main`:
- Require a pull request before merging (no direct pushes)
- Require the `CI / static-checks` status check to pass before merging
- Require branches to be up to date before merging

These can't be set from the codebase itself — they're repo settings, not files.
