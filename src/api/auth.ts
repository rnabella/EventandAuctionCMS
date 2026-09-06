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
