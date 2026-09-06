import { BasePage } from '../BasePage';
import { env } from '../../config/env';

/**
 * The public Lite UI is a query-string-routed app: every screen is
 * `/?controller=<c>&action=<a>&...`. Pages navigate with `gotoLite()` and wait
 * for their own landmark element — several screens (checkout, in particular)
 * poll the back end forever and never reach `networkidle`.
 */
export abstract class LiteBasePage extends BasePage {
  protected liteUrl(controller: string, action?: string, params: Record<string, string> = {}): string {
    const search = new URLSearchParams({ controller, ...(action ? { action } : {}), ...params, tabletMode: 'false' });
    return `${env.e2e.liteUiBaseUrl}/?${search.toString()}`;
  }

  protected async gotoLite(controller: string, action?: string, params?: Record<string, string>): Promise<void> {
    await this.page.goto(this.liteUrl(controller, action, params), { waitUntil: 'domcontentloaded' });
  }
}
