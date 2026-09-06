import { LiteBasePage } from './LiteBasePage';

/**
 * `?controller=guest&action=checkRegistration` — "Sign in". Defaults to phone
 * (which would send a real SMS code); the email path is a link on the form.
 * Behind invisible reCAPTCHA Enterprise — headless Chromium passes it.
 */
export class LiteSignInPage extends LiteBasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Sign in' });
  readonly signInViaEmailLink = this.page.getByRole('link', { name: 'Sign in via email' });
  readonly emailField = this.page.getByRole('textbox', { name: 'Email' });
  // Renders as "Loading..." until the captcha token is ready; getByRole waits for the real label.
  readonly continueButton = this.page.getByRole('button', { name: 'Continue' });

  /** For a never-seen email the site moves on to the registration form ("Enter your details"). */
  async continueWithEmail(email: string): Promise<void> {
    await this.heading.waitFor();
    await this.signInViaEmailLink.click();
    await this.emailField.fill(email);
    await this.continueButton.click();
  }
}
