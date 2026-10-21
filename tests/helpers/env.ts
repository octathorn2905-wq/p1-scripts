import fs from 'fs';
import path from 'path';

export type Portal = 'staff' | 'veteran' | 'provider';

export type RoleKey =
  | 'ADMIN'
  | 'SCHEDULER'
  | 'BILLER'
  | 'REVIEWER'
  | 'ORGANIZATION'
  | 'VETERAN'
  | 'REPRESENTATIVE'
  | 'PROVIDER';

const PORTAL_URL: Record<Portal, string> = {
  staff: 'STAFF_URL',
  veteran: 'VETERAN_URL',
  provider: 'PROVIDER_URL',
};

export function loadEnv(): void {
  const file = path.resolve(process.cwd(), '.env');
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

export class SmokeError extends Error {
  readonly kind: 'application' | 'automation' | 'test-data';

  constructor(kind: 'application' | 'automation' | 'test-data', message: string) {
    super(`[${kind}] ${message}`);
    this.name = 'SmokeError';
    this.kind = kind;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new SmokeError('automation', `Missing environment variable ${name}. Add it to smoke/.env.`);
  }
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

export function foreignCaseId(): string {
  return process.env.SMOKE_FOREIGN_CASE_ID?.trim() || 'NXL-2026-0245';
}

export function foreignInvoiceId(): string {
  return process.env.SMOKE_FOREIGN_INVOICE_ID?.trim() || 'INV-2026-0517';
}

export function foreignVeteranName(): string {
  return process.env.SMOKE_FOREIGN_VETERAN_NAME?.trim() || 'Nex Vet';
}
