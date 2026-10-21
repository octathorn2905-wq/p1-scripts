import fs from 'fs';
import path from 'path';
import { failAutomation } from './errors';

export type Portal = 'staff' | 'veteran' | 'provider';

export type RoleKey = 'ADMIN' | 'SCHEDULER' | 'BILLER' | 'REVIEWER' | 'ORGANIZATION' | 'VETERAN' | 'REPRESENTATIVE' | 'PROVIDER';

const PORTAL_URL: Record<Portal, string> = {
  staff: 'STAFF_URL',
  veteran: 'VETERAN_URL',
  provider: 'PROVIDER_URL',
};

/** Read `.env` from the repo root into `process.env`. Values already set in the shell win. */
export function loadEnv(): void {
  const file = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) failAutomation(`Missing environment variable ${name}. Add it to .env (see .env.example).`);
  return value;
}

export function portalUrl(portal: Portal): string {
  return requireEnv(PORTAL_URL[portal]).replace(/\/$/, '');
}

export function credentials(role: RoleKey): { email: string; password: string } {
  return {
    email: requireEnv(`${role}_EMAIL`),
    password: requireEnv(`${role}_PASSWORD`),
  };
}
