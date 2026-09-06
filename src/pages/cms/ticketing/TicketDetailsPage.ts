import { Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { TICKETING_ROUTES } from '../../../data/cmsRoutes';

/**
 * The "Details" tab under Ticketing — checklist item "Update the ticket details".
 * The page is a single rich-text (TipTap/ProseMirror) template with mustache
 * placeholders ({{eventName}}, {{ticketingDate}}, ...) plus a header image upload.
 * Rewriting rich-text template content safely is follow-up work, so this only
 * verifies the default template renders correctly.
 */
export class TicketDetailsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get descriptionEditor() {
    return this.page.locator('[contenteditable="true"]').first();
  }

  async goto(eventId: string) {
    await this.page.goto(`events/${eventId}/${TICKETING_ROUTES.details}`);
    await this.descriptionEditor.waitFor({ state: 'visible' });
  }

  async getDescriptionText(): Promise<string> {
    return this.descriptionEditor.innerText();
  }
}
