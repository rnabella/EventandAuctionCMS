import { expect } from '@playwright/test';
import { LiteBasePage } from '../LiteBasePage';

/** `?controller=myBids&action=winning` — "My Activity", tabs Winning / Outbid / Donations / Favorites. */
export class MyActivityPage extends LiteBasePage {
  /**
   * Each tab renders as a nested pair of `role="tab"` elements (an outer
   * `<tab [selected]>` wrapping an inner `<tab>` with the visible label) —
   * verified live 2026-09-07. `getByRole('tab', {name, exact})` alone matches
   * both and throws a strict-mode violation, so take the innermost (leaf) one.
   */
  private tab(name: string) {
    return this.page.getByRole('tab', { name, exact: true }).last();
  }

  async gotoWinning(): Promise<void> {
    await this.gotoLite('myBids', 'winning');
    await this.tab('Winning').waitFor();
  }

  async gotoOutbid(): Promise<void> {
    await this.gotoLite('myBids', 'winning');
    await this.tab('Winning').waitFor();
    await this.tab('Outbid').click();
  }

  async expectListed(title: string): Promise<void> {
    await expect(this.page.getByRole('link', { name: `Add ${title} to Favourites` })).toBeVisible({ timeout: 15_000 });
  }

  async expectNotListed(title: string): Promise<void> {
    await expect(this.page.getByRole('link', { name: `Add ${title} to Favourites` })).toHaveCount(0);
  }
}
