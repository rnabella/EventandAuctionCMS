import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { SavableCard } from '../components/SavableCard';
import { FUNDRAISING_WEBSITE_ROUTES } from '../../../data/cmsRoutes';

/** The "Branding" tab under Fundraising Website — checklist item "Add your color scheme and logos". */
export class BrandingPage extends BasePage {
  readonly colours = new SavableCard(this.page, 'COLOURS');

  constructor(page: Page) {
    super(page);
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${FUNDRAISING_WEBSITE_ROUTES.branding}`);
    await this.colours.card.waitFor({ state: 'visible' });
  }

  /**
   * Not using `this.colours.field('Theme Colour:')` here: the label's `for="themeColour"`
   * doesn't match any element's `id` in the DOM (a real accessibility bug — flagged for the
   * Phase 11/accessibility-testing backlog), so getByLabel can't resolve it. Falls back to
   * the input's `name` attribute instead.
   */
  private get themeColourInput() {
    return this.colours.card.locator('input[name="themeColour"]');
  }

  async setThemeColour(hex: string) {
    await this.ensureNavbarColoursAreValid();
    await this.themeColourInput.fill(hex);
    // This field only registers the change (enabling Save) on blur, unlike the
    // plain text fields elsewhere in the CMS that react to input immediately.
    await this.themeColourInput.blur();
    await this.colours.save();
  }

  /**
   * BUG (found 2026-07-26 on the Integration environment): the Colours card's Save
   * validates every field in the card, not just the one being changed. On this test
   * event, "Navbar Colour" and "Navbar Text Colour" were already blank/invalid, which
   * silently blocked Save for the *entire* card — including unrelated fields like Theme
   * Colour — with no error surfaced until you inspect the two fields directly. Filling
   * them with a valid placeholder here is a workaround so this test can save at all;
   * it does not fix the underlying validation/UX issue, which should be reported.
   */
  private async ensureNavbarColoursAreValid() {
    for (const name of ['navBarColour', 'navBarTextColour']) {
      const input = this.colours.card.locator(`input[name="${name}"]`);
      const value = await input.inputValue();
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
        await input.fill('#ffffff');
        await input.blur();
      }
    }
  }

  async getThemeColour(): Promise<string> {
    return this.themeColourInput.inputValue();
  }
}
