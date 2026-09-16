## What this changes

<!-- One or two sentences: what feature/fix does this add, and why. -->

## Verified live?

<!-- If this touches an endpoint shape, a locator, or any behavior claim — confirm it was checked
against the real Integration environment, not assumed. Link/describe how, if not obvious from the diff. -->

## Local checks run before opening this PR

- [ ] `npm run ci` (typecheck + lint + format check) — green
- [ ] Relevant test suite(s) run locally and green: `npm test` / `npm run test:fundraising` / both
- [ ] Any new test that creates real data cleans up after itself (including on the failure path)
- [ ] Any surprising/non-obvious finding is documented in `README.md`'s gotchas sections

## Anything a reviewer should pay extra attention to?

<!-- Shared-fixture races, a deviation from the established page-object pattern, a judgment call worth a second opinion — call it out here so it doesn't get missed. -->
