import { test, expect } from '@playwright/test';
import { TicketsPage } from '../../../src/pages/cms/ticketing/TicketsPage';
import { QuestionsPage } from '../../../src/pages/cms/ticketing/QuestionsPage';
import { PromotionCodesPage } from '../../../src/pages/cms/ticketing/PromotionCodesPage';
import { TicketSettingsPage } from '../../../src/pages/cms/ticketing/TicketSettingsPage';
import { env } from '../../../src/config/env';

/**
 * Tickets, Questions, Promotion Codes, and Settings were originally four
 * separate spec files. Discovered (2026-09-02): saving any one of them
 * cascades into resaving the *entire* ticketing configuration, tickets
 * included — confirmed via network trace when saving Questions also fired a
 * POST to update every existing ticket. Running these concurrently (as
 * separate files normally would, under `fullyParallel`) is a lost-update
 * race: one test's save can silently overwrite another's freshly-written
 * data with a stale snapshot it loaded before the other's write landed.
 *
 * This raced rarely while the shared Integration event carried a lot of
 * accumulated test data (slow page loads spaced the tests out by accident);
 * once cleanup tooling (`npm run cleanup`) trimmed that data and pages got
 * fast again, the race started reproducing consistently. Merged into one
 * file with `describe.serial` — Playwright can't serialize across separate
 * files, only within one describe block — so these four never run concurrently
 * with each other. `details.spec.ts` stays separate: it's read-only, so it
 * can't lose an update and is safe to run in parallel with everything else.
 */
test.describe.serial('CMS Ticketing > writes (serialized: shared cascading save)', () => {
  test('creates a new active ticket and it appears in the tickets list (checklist: Create your tickets)', async ({ page }) => {
    const ticketsPage = new TicketsPage(page);
    await ticketsPage.goto(env.testEventId);

    const title = 'QA Automation Test Ticket';
    const price = 25;
    const ticketId = await ticketsPage.createTicket(title, price);
    expect(ticketId).toMatch(/^[0-9a-f-]{36}$/);

    await ticketsPage.goto(env.testEventId);
    expect(await ticketsPage.hasTicketWithTitleAndPrice(title, price)).toBe(true);
  });

  test('adds a custom question and it persists (checklist: Configure your questions)', async ({ page }) => {
    const questionsPage = new QuestionsPage(page);
    await questionsPage.goto(env.testEventId);

    const questionText = 'Do you have any dietary requirements? (QA Automation)';
    await questionsPage.addQuestion(questionText);

    await questionsPage.goto(env.testEventId);
    expect(await questionsPage.hasQuestion(questionText)).toBe(true);
  });

  test('adds a promotion code and it persists (checklist: Create your promo codes)', async ({ page }) => {
    const promotionCodesPage = new PromotionCodesPage(page);
    await promotionCodesPage.goto(env.testEventId);

    const code = 'QAAUTO10';
    await promotionCodesPage.addPromotionCode(code, 'QA Automation test promo code');

    await promotionCodesPage.goto(env.testEventId);
    expect(await promotionCodesPage.hasPromotionCode(code)).toBe(true);
  });

  test('enables "Pay Later on Website" and it persists (checklist: Configure your ticket settings)', async ({ page }) => {
    const ticketSettingsPage = new TicketSettingsPage(page);
    await ticketSettingsPage.goto(env.testEventId);

    await ticketSettingsPage.setEnablePayLaterOnWebsite(true);

    await ticketSettingsPage.goto(env.testEventId);
    expect(await ticketSettingsPage.isEnablePayLaterOnWebsiteChecked()).toBe(true);
  });
});
