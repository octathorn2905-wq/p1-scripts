import { expect, Page, TestInfo } from '@playwright/test';
import { Portal, portalUrl, SmokeError } from '../helpers/env';
import { annotate, noteActual, signIn, waitForShell } from '../helpers/session';
import type { RoleKey } from '../helpers/env';

export type AuthName =
  | 'admin'
  | 'scheduler'
  | 'reviewer'
  | 'organization'
  | 'veteran'
  | 'representative'
  | 'provider';

export function app(message: string): never {
  throw new SmokeError('application', message);
}

export function blocked(message: string): never {
  throw new SmokeError('test-data', message);
}

export async function readPage(page: Page): Promise<string> {
  await page.getByText(/Please wait a moment|Loading…/i).first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
  return (await page.locator('body').innerText()).replace(/\u00a0/g, ' ');
}

export function flat(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export async function open(page: Page, portal: Portal, path: string): Promise<string> {
  await page.goto(`${portalUrl(portal)}${path}`, { waitUntil: 'domcontentloaded' });
  await waitForShell(page);
  return readPage(page);
}

export async function openAdmin(page: Page, path: string): Promise<string> {
  return open(page, 'staff', path);
}

export function requireMatch(text: string, pattern: RegExp, message: string): string {
  const match = text.match(pattern);
  if (!match) app(`${message} Visible text: ${flat(text).slice(0, 500)}`);
  return match[0];
}

export async function switchRole(page: Page, portal: Portal, role: RoleKey): Promise<void> {
  await page.context().clearCookies();
  await signIn(page, portal, role);
}

export async function finish(testInfo: TestInfo, actual: string): Promise<string> {
  await noteActual(testInfo, actual);
  return actual;
}

export function expectArea(
  testInfo: TestInfo,
  details: { area: string; acceptance: string; steps: string[] },
): void {
  annotate(testInfo, { role: details.area, expected: details.acceptance, steps: details.steps });
}

export async function clickNamed(page: Page, name: string): Promise<void> {
  const control = page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true }));
  await expect(control.first()).toBeVisible();
  await control.first().click();
}

export async function openStaffCase(page: Page, mrn: string): Promise<string> {
  await open(page, 'staff', '/staff/cases');
  const row = page.locator('[role="row"]').filter({ hasText: mrn }).first();
  await row.waitFor({ state: 'visible', timeout: 25_000 });
  const opener = row.getByRole('button', { name: /Edit \/ Open|Open/i }).first();
  await opener.click();
  await waitForShell(page);
  return readPage(page);
}

export async function openProviderCase(page: Page, mrn: string): Promise<string> {
  await open(page, 'provider', '/provider/cases');
  const row = page.locator('[role="row"]').filter({ hasText: mrn }).first();
  try {
    await row.waitFor({ state: 'visible', timeout: 20_000 });
  } catch {
    blocked(`Provider case list did not show ${mrn}, so this check could not use that case.`);
  }
  const opener = row.getByRole('button', { name: /^Open/i }).or(row.getByRole('link', { name: /^Open/i })).first();
  if (await opener.count()) await opener.click();
  else await row.click();
  await waitForShell(page);
  return readPage(page);
}
