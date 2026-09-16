import { Page } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * The top-of-page notification banner used for both success and error messages
   * (e.g. "Incorrect password. Please try again.", "Session expired or unauthorized.").
   * Matched by visible text rather than a CSS class, since the banner's markup is
   * an implementation detail we don't want page objects coupled to.
   */
  async waitForAlert(text: string | RegExp) {
    const alert = this.page.getByText(text).first();
    await alert.waitFor({ state: 'visible' });
    return alert;
  }

  /**
   * Success toasts (e.g. "Donor updated successfully!") don't auto-dismiss
   * fast enough during a rapid delete loop — they stack up in the top-right
   * corner and eventually cover the very row action buttons the loop needs to
   * click next, blocking with "intercepts pointer events". Closing them via
   * their own `aria-label="Close"` button keeps the corner clear.
   */
  private async dismissToasts() {
    const closeButtons = this.page.getByRole('button', { name: 'Close', exact: true });
    const count = await closeButtons.count();
    for (let i = 0; i < count; i++) {
      await closeButtons
        .first()
        .click()
        .catch(() => {});
    }
  }

  /**
   * Deletes every row in an HTML-table-based list (Tickets, Campaign Items,
   * Donors, Inventory Items, Guests, notification Drafts all share this exact
   * UI, just with different confirm-button wording) whose text matches
   * `rowText`: click the row's last button (the trash/delete icon — Edit,
   * when present, is either an earlier button or a plain `<a>` link, so
   * `.last()` on `button` elements reliably lands on Delete), then confirm
   * via the "Are you sure...?" dialog. Loops until no matching rows remain,
   * since repeated CRUD test runs create multiple identically-named rows.
   */
  protected async deleteAllTableRowsMatching(
    rowText: string,
    options?: { confirmButtonName?: string; maxDeletions?: number },
  ): Promise<number> {
    const confirmButtonName = options?.confirmButtonName ?? 'YES, DELETE';
    const maxDeletions = options?.maxDeletions ?? 200;
    const matchingRows = this.page.locator('tbody tr', { hasText: rowText });
    const confirmButton = this.page.getByRole('button', { name: confirmButtonName, exact: true });
    let deleted = 0;
    while (deleted < maxDeletions) {
      // Some of these lists (Inventory Items) fully remount their table after a
      // delete, briefly leaving `tbody` empty/detached — a plain `.count()` can
      // catch that transient state and wrongly conclude nothing is left. Settle
      // on network idle first so the count reflects the real, reloaded list.
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.dismissToasts();
      if ((await matchingRows.count()) === 0) {
        break;
      }
      await matchingRows.first().locator('button').last().click();
      await confirmButton.click();
      // The dialog's backdrop lingers through its close transition and intercepts
      // the next row's click if the loop doesn't wait for it to fully detach.
      await confirmButton.waitFor({ state: 'hidden' });
      deleted++;
    }
    return deleted;
  }

  /**
   * Deletes every card in a card-based list (Table Plan, unlike every other
   * list here, isn't an HTML table — see cms-ui-technical-notes memory) whose
   * text matches `cardText`, via that card's own "Delete" button + confirm dialog.
   */
  protected async deleteAllCardsMatching(
    cardText: string,
    options?: { confirmButtonName?: string; maxDeletions?: number },
  ): Promise<number> {
    const confirmButtonName = options?.confirmButtonName ?? 'DELETE';
    const maxDeletions = options?.maxDeletions ?? 200;
    const confirmButton = this.page.getByRole('button', { name: confirmButtonName, exact: true });
    let deleted = 0;
    while (deleted < maxDeletions) {
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.dismissToasts();
      const card = this.page
        .getByText(cardText, { exact: true })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"MuiPaper-root")][1]');
      if ((await card.count()) === 0) {
        break;
      }
      await card.getByRole('button', { name: 'Delete', exact: true }).click();
      await confirmButton.click();
      await confirmButton.waitFor({ state: 'hidden' });
      deleted++;
    }
    return deleted;
  }

  /**
   * Deletes every row in an "expand to edit" list (Questions, Promotion Codes)
   * whose text matches `rowText`. Unlike the table/card patterns above, this
   * one is a 3-step dance: click the row's "Edit" link to expand it in place,
   * click the trash icon that appears in the expanded editor (matched by its
   * Material Design delete-icon SVG path, since the icon buttons here carry no
   * accessible name), then confirm via a "CONFIRM" dialog. That only removes
   * the row from the page's local form state — the page-level Save button
   * (passed in, since its exact accessible name/scope varies per page) must
   * still be clicked afterward to actually persist the removal.
   */
  protected async deleteAllExpandableRowsWithSave(
    rowText: string,
    saveButtonLocator: ReturnType<Page['getByRole']>,
    maxDeletions = 50,
  ): Promise<number> {
    const trashIconInExpandedRow = this.page
      .locator('button')
      .filter({ has: this.page.locator('svg path[d*="M6 19c0 1.1"]') })
      .first();
    const confirmButton = this.page.getByRole('button', { name: 'CONFIRM', exact: true });
    let deleted = 0;
    while (deleted < maxDeletions) {
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.dismissToasts();
      const target = this.page.getByText(rowText, { exact: true }).first();
      if ((await target.count()) === 0) {
        break;
      }
      const editLink = target.locator('xpath=following::*[normalize-space(text())="Edit"][1]');
      await editLink.click();
      await trashIconInExpandedRow.click();
      await confirmButton.click();
      await confirmButton.waitFor({ state: 'hidden' });
      await saveButtonLocator.click();
      await this.page.waitForLoadState('networkidle').catch(() => {});
      deleted++;
    }
    return deleted;
  }
}
