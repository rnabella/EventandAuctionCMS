import fs from 'fs';
import path from 'path';

/** Written by tests/setup/api.setup.ts; read by the `ems` fixture. Gitignored via playwright/.auth/. */
export const EMS_TOKEN_FILE = path.join(__dirname, '../../playwright/.auth/ems-token.json');

export function writeEmsToken(token: string): void {
  fs.mkdirSync(path.dirname(EMS_TOKEN_FILE), { recursive: true });
  fs.writeFileSync(EMS_TOKEN_FILE, JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2));
}

export function readEmsToken(): string {
  if (!fs.existsSync(EMS_TOKEN_FILE)) {
    throw new Error(`${EMS_TOKEN_FILE} not found — run the "api-setup" project first (npm run test:api / test:e2e do this).`);
  }
  return (JSON.parse(fs.readFileSync(EMS_TOKEN_FILE, 'utf8')) as { token: string }).token;
}

/**
 * Written by `ensureApiGuest` (src/api/guestFixture.ts) only when the static `E2E_API_GUEST_ID`
 * env value stops resolving and a fresh guest had to be registered. Read by the `e2eEvent`
 * fixture in preference to the env value, so a healed run doesn't need a new `.env` edit.
 * Gitignored via playwright/.auth/, same as the EMS token file.
 */
export const E2E_API_GUEST_FILE = path.join(__dirname, '../../playwright/.auth/e2e-api-guest.json');

export function writeE2EApiGuestId(guestId: string): void {
  fs.mkdirSync(path.dirname(E2E_API_GUEST_FILE), { recursive: true });
  fs.writeFileSync(E2E_API_GUEST_FILE, JSON.stringify({ guestId, createdAt: new Date().toISOString() }, null, 2));
}

/** Returns `undefined` if no guest has ever needed healing — the normal case. */
export function readE2EApiGuestId(): string | undefined {
  if (!fs.existsSync(E2E_API_GUEST_FILE)) {
    return undefined;
  }
  return (JSON.parse(fs.readFileSync(E2E_API_GUEST_FILE, 'utf8')) as { guestId: string }).guestId;
}
