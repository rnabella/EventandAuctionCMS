import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * The CMS's "Login to the CMS Directly" form is a two-step flow rendered on a
 * single page: submitting the username reveals a password field in place,
 * rather than navigating to a second page.
 */
export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private readonly usernameInput = this.page.locator('input[name="username"]');
  private readonly passwordInput = this.page.locator('input[name="password"]');
  private readonly continueButton = this.page.getByRole('button', { name: 'LOGIN TO CMS' });

  async goto() {
    await this.page.goto('login/');
  }

  async submitUsername(username: string) {
    await this.usernameInput.fill(username);
    await this.continueButton.click();
    await this.passwordInput.waitFor({ state: 'visible' });
  }

  async submitPassword(password: string) {
    await this.passwordInput.fill(password);
    await this.continueButton.click();
  }

  async login(username: string, password: string) {
    await this.submitUsername(username);
    await this.submitPassword(password);
  }

  async expectIncorrectPasswordError() {
    await this.waitForAlert(/incorrect password/i);
  }
}
