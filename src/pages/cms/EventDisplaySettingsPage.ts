import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { EVENT_DISPLAYS_ROUTES } from '../../data/cmsRoutes';

/**
 * The "Select Screen" page under Event Displays — covers both checklist items:
 * "Create & Design your Event Display Screens" (the colour/branding fields once
 * a screen is chosen) and "Share with your onsite AV team to display" (the
 * "Event Display Preview" link, which is a real `<a target="_blank">` — not a
 * button — whose href is the actual URL to hand to the AV team).
 *
 * Like Branding's Theme Colour, this page's colour field's `<label for="themeColour">`
 * doesn't match any real element id — the actual input's name is a generic,
 * positionally-indexed "newCol1" rather than anything semantic, so it's
 * located by label-proximity instead of by label-for or name.
 */
export class EventDisplaySettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get screenDropdown() {
    return this.page.getByRole('combobox').first();
  }

  private get saveButton() {
    return this.page.getByRole('button', { name: 'Save', exact: true });
  }

  private get themeColourInput() {
    return this.page.locator('label:has-text("Theme Colour:")').first().locator('xpath=following::input[1]');
  }

  private get previewLink() {
    return this.page.getByRole('link', { name: 'Event Display Preview' });
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${EVENT_DISPLAYS_ROUTES.defaultScreensSettings}`, { waitUntil: 'networkidle' });
    await this.screenDropdown.waitFor({ state: 'visible' });
  }

  async selectScreen(screenName: string) {
    await this.screenDropdown.click();
    await this.page.getByRole('option', { name: screenName }).click();
    await this.themeColourInput.waitFor({ state: 'visible' });
    // The input can become visible before its value has actually populated — an async fetch
    // after selection — verified live 2026-09-16 as a real, reproducible WebKit-specific race
    // (getThemeColour() read "" right after this returned). Wait for a real value, not just
    // visibility, since every screen always has some colour once fully loaded.
    await expect(this.themeColourInput).not.toHaveValue('');
  }

  /**
   * Clicks Save and waits for it to go back to disabled, confirming the save round-trip
   * completed — without this, navigating away immediately after clicking (as the checklist
   * spec's "reload and re-read" verification does) can race the actual persist, verified
   * live 2026-09-16 (the write was real, just not always finished before the reload fired).
   */
  async setThemeColour(hex: string) {
    await this.themeColourInput.fill(hex);
    await this.themeColourInput.blur();
    if (!(await this.saveButton.isEnabled())) {
      return; // nothing changed
    }
    await this.saveButton.click();
    await expect(this.saveButton).toBeDisabled();
  }

  async getThemeColour(): Promise<string> {
    return this.themeColourInput.inputValue();
  }

  async getPreviewLinkHref(): Promise<string | null> {
    return this.previewLink.getAttribute('href');
  }
}
