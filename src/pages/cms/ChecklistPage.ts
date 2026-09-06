import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * The Checklist page renders as a single flat MUI list: section names are
 * `ListSubheader`s interspersed with `ListItem`s, not a nested list per section.
 * Item titles are unique across the whole checklist, so page object methods key
 * off the item's title text rather than trying to scope by section in the DOM.
 *
 * The app renders each row (and each section heading) twice — once per
 * responsive breakpoint — with CSS hiding whichever doesn't apply, both
 * copies present in the DOM at once. `getByRole('listitem')` doesn't resolve
 * on this list (the `<ul>` doesn't expose an accessible list role here), so
 * locators are scoped by class name and filtered to the currently-visible
 * copy of each row/heading instead.
 */
export class ChecklistPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private readonly sectionHeadings = this.page.locator('.MuiListSubheader-root:visible');
  private readonly progressBar = this.page.getByRole('progressbar');
  private readonly hideCompletedToggle = this.page.getByRole('switch', { name: /hide completed/i });

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/checklist/`);
    // The list is populated by an async API call after the initial page load,
    // so wait for real content rather than assuming it's there once goto() resolves.
    await this.sectionHeadings.first().waitFor({ state: 'visible' });
  }

  item(title: string) {
    return this.page.locator('li.MuiListItem-root:visible').filter({ hasText: title });
  }

  async getSectionNames(): Promise<string[]> {
    return this.sectionHeadings.allInnerTexts();
  }

  async getCompletionPercentage(): Promise<number> {
    const value = await this.progressBar.getAttribute('aria-valuenow');
    if (value === null) {
      throw new Error('Checklist progress bar is missing an aria-valuenow attribute');
    }
    return Number(value);
  }

  async toggleHideCompleted() {
    await this.hideCompletedToggle.click();
  }

  async isItemOverdue(title: string): Promise<boolean> {
    return this.item(title).getByText('Overdue', { exact: true }).isVisible();
  }

  async isItemChecked(title: string): Promise<boolean> {
    return this.item(title).locator('input[type="checkbox"]').isChecked();
  }

  async openItem(title: string) {
    const row = this.item(title);
    await row.scrollIntoViewIfNeeded();
    await row.getByRole('button').click();
  }

  helpLinkFor(title: string) {
    return this.item(title).getByRole('link', { name: 'Help' });
  }
}
