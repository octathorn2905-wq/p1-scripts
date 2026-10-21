import path from 'path';
import { Browser, BrowserContext, Page } from '@playwright/test';
import { credentials, Portal, portalUrl, RoleKey } from './env';
import { failAutomation, P1Error } from './errors';
import { flat, waitForContent } from './ui';

/** Roles that `tests/auth.setup.ts` signs in once per run, and the portal each one belongs to. */
export const SAVED_SESSIONS = {
  ADMIN: 'staff',
  VETERAN: 'veteran',
  PROVIDER: 'provider',
} as const satisfies Partial<Record<RoleKey, Portal>>;

export type SavedRole = keyof typeof SAVED_SESSIONS;

export const AUTH_DIR = path.resolve(__dirname, '..', '..', '.auth');

/** Storage-state file written by the setup project. Use with `test.use({ storageState })` or `openSession`. */
export function authFile(role: SavedRole): string {
  return path.join(AUTH_DIR, `${role.toLowerCase()}.json`);
}

/** Dismiss the portal splash and wait until the signed-in shell is interactive. */
export async function waitForShell(page: Page): Promise<void> {
  const verifying = page.getByText(/Verifying user/i);
  if (await verifying.isVisible().catch(() => false)) {
    await verifying.waitFor({ state: 'hidden', timeout: 45_000 });
  }
  const loading = page.getByText(/Nexletta is loading/i);
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: 45_000 });
  }
  await page.getByRole('button', { name: 'Logout' }).waitFor({ state: 'visible', timeout: 45_000 });
}

/** Sign in through the login form. Only the setup project and checks that log in as a brand-new user need this. */
export async function signIn(page: Page, portal: Portal, role: RoleKey): Promise<void> {
  const { email, password } = credentials(role);
  const loginUrl = `${portalUrl(portal)}/login`;
  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    failAutomation(`Could not open ${loginUrl}. ${String(error)}`);
  }

  const emailBox = page.getByRole('textbox', { name: /Email/i });
  try {
    await emailBox.waitFor({ state: 'visible', timeout: 40_000 });
  } catch {
    failAutomation(
      `Sign-in form did not appear at ${page.url()}. The portal may still be on the splash screen or the login labels changed.`,
    );
  }

  await emailBox.fill(email);
  await page.getByRole('textbox', { name: /Password/i }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const signedIn = page.getByRole('button', { name: 'Logout' });
  try {
    await signedIn.waitFor({ state: 'visible', timeout: 50_000 });
  } catch {
    const body = flat(
      await page
        .locator('body')
        .innerText()
        .catch(() => ''),
    ).slice(0, 500);
    const credentialProblem = /invalid|incorrect|wrong password|not found|unauthorized|credentials|no account/i.test(body);
    throw new P1Error(
      credentialProblem ? 'test-data' : 'automation',
      `Sign-in for ${role} did not reach the signed-in shell (${page.url()}). ${body}`,
    );
  }

  await waitForShell(page);
}

/** A new browser context that is already signed in as `role`, from the saved storage state. Close it in `finally`. */
export async function openSession(browser: Browser, role: SavedRole): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: authFile(role) });
  const page = await context.newPage();
  return { context, page };
}

/** Open a route on a portal and wait until the signed-in shell and page content have loaded. */
export async function gotoPortal(page: Page, portal: Portal, route: string): Promise<void> {
  await page.goto(`${portalUrl(portal)}${route}`, { waitUntil: 'domcontentloaded' });
  await waitForShell(page);
  await waitForContent(page);
}
