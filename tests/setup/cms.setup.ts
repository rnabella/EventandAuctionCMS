import path from 'path';
import { test as setup } from '@playwright/test';
import { LoginPage } from '../../src/pages/cms/LoginPage';
import { env } from '../../src/config/env';

export const CMS_ADMIN_AUTH_FILE = path.join(__dirname, '../../playwright/.auth/admin.json');

/**
 * Logs into the CMS once per test run and persists the session (cookies/local storage)
 * so that ordinary test specs can start already-authenticated via `storageState`,
 * instead of repeating the UI login flow in every test.
 */
setup('authenticate as admin', { tag: '@smoke' }, async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(env.cms.username, env.cms.password);
  await page.waitForURL((url) => !url.pathname.includes('/login'));
  await page.context().storageState({ path: CMS_ADMIN_AUTH_FILE });
});
