import { expect, Page, TestInfo } from '@playwright/test';
import { credentials, Portal, portalUrl, RoleKey, SmokeError } from './env';

export function annotate(
  testInfo: TestInfo,
  details: { role: string; expected: string; steps: string[] },
): void {
  testInfo.annotations.push({ type: 'role', description: details.role });
  testInfo.annotations.push({ type: 'expected', description: details.expected });
  testInfo.annotations.push({ type: 'repro', description: details.steps.map((step, i) => `${i + 1}. ${step}`).join('\n') });
}

export async function noteActual(testInfo: TestInfo, actual: string): Promise<void> {
  testInfo.annotations.push({ type: 'actual', description: actual });
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

export async function signIn(page: Page, portal: Portal, role: RoleKey): Promise<void> {
  const { email, password } = credentials(role);
  const loginUrl = `${portalUrl(portal)}/login`;
  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    throw new SmokeError('automation', `Could not open ${loginUrl}. ${String(error)}`);
  }

  const emailBox = page.getByRole('textbox', { name: /Email/i });
  try {
    await emailBox.waitFor({ state: 'visible', timeout: 40_000 });
  } catch {
    throw new SmokeError(
      'automation',
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
    const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
    const credentialProblem = /invalid|incorrect|wrong password|not found|unauthorized|credentials|no account/i.test(body);
    throw new SmokeError(
      credentialProblem ? 'test-data' : 'automation',
      `Sign-in for ${role} did not reach the signed-in shell (${page.url()}). ${body}`,
    );
  }

  await waitForShell(page);
}

export async function openNav(page: Page, name: string): Promise<void> {
  const link = page.getByRole('link', { name, exact: true });
  try {
    await expect(link).toBeVisible();
  } catch {
    throw new SmokeError('application', `Navigation link "${name}" is not available after sign-in at ${page.url()}.`);
  }
  await link.click();
  await waitForShell(page);
}

export async function pageHeading(page: Page): Promise<string> {
  const heading = page.getByRole('heading', { level: 2 }).first();
  if (!(await heading.isVisible().catch(() => false))) return '(no level-2 heading)';
  return (await heading.innerText()).trim();
}

/**
 * Direct navigation, not menu hiding. A module is blocked when its page heading
 * never becomes the screen the user is looking at.
 */
export async function expectModuleBlocked(page: Page, path: string, heading: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/Verifying user/i).waitFor({ state: 'hidden', timeout: 40_000 }).catch(() => undefined);
  await page.getByText(/Nexletta is loading/i).waitFor({ state: 'hidden', timeout: 40_000 }).catch(() => undefined);

  const target = page.getByRole('heading', { level: 2, name: heading, exact: true });
  const opened = await target.waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false);
  if (opened) {
    throw new SmokeError(
      'application',
      `${heading} opened at ${page.url()}. This role must be blocked from that page.`,
    );
  }

  const logout = await page.getByRole('button', { name: 'Logout' }).isVisible().catch(() => false);
  const login = await page.getByRole('button', { name: 'Sign in' }).isVisible().catch(() => false);
  if (!logout && !login) {
    throw new SmokeError(
      'automation',
      `After opening ${path}, the page was neither the signed-in shell nor the sign-in form, so the block could not be judged. URL: ${page.url()}.`,
    );
  }
}

export function isBlankOrg(value: string): boolean {
  const cleaned = value.replace(/\s+/g, ' ').trim().toLowerCase();
  return cleaned === '' || cleaned === '—' || cleaned === '-' || cleaned === 'none' || cleaned === 'n/a' || cleaned === 'no organization';
}
