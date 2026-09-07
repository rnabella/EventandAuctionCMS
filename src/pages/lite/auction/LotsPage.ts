import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';

/** `?controller=lots&category=All%20Lots` — the silent-auction browse page. */
export class LotsPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Silent Auction', exact: true });

  async goto(): Promise<void> {
    await this.gotoLite('lots', undefined, { category: 'All Lots' });
    await this.heading.waitFor();
  }

  /**
   * Opens a lot's detail page directly by title, confirming it is actually
   * listed first. `lotUuid` isn't used in the navigation itself — the site's
   * own links use the lot's short display number, not its UUID — but is kept
   * as a parameter so callers don't need a second lookup just to log which
   * lot they meant.
   */
  async openLot(lotUuid: string, title: string): Promise<void> {
    const link = this.page.getByRole('link', { name: `Add ${title} to Favourites` });
    await expect(link).toBeVisible();
    await link.click();
    await this.page.waitForURL(/action=showLot/, { timeout: 15_000 });
    void lotUuid;
  }
}
