import { test, expect } from '@playwright/test';
import { LoginPage } from '../../../src/pages/cms/LoginPage';
import { env } from '../../../src/config/env';

test.describe('CMS Authentication', () => {
  test('logs in successfully with valid credentials', { tag: '@smoke' }, async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login(env.cms.username, env.cms.password);

    await page.waitForURL((url) => !url.pathname.includes('/login'));
    await expect(page).not.toHaveURL(/\/login\//);
  });

  test('shows an error and stays on the login page for an incorrect password', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.submitUsername(env.cms.username);
    await loginPage.submitPassword('not-the-real-password');

    await loginPage.expectIncorrectPasswordError();
    await expect(page).toHaveURL(/\/login\//);
  });
});
