import { LiteBasePage } from './LiteBasePage';

/** `?controller=guest&action=register2` — "Stay connected" marketing opt-ins shown once after registering. */
export class OptInsPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Stay connected' });
  readonly continueButton = this.page.getByRole('button', { name: 'Continue' });

  /** Leaves every opt-in at its default and moves on. */
  async continueWithDefaults(): Promise<void> {
    await this.heading.waitFor();
    await this.continueButton.click();
  }
}
