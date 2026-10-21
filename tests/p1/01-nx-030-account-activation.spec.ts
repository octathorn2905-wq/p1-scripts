/**
 * NX-030 Separate account activation from invitation and identity checks
 *
 * Order:    01
 * Run only: npx playwright test -g "NX-030"
 * Signs in: ADMIN (saved session), then the new staff user through the login form
 * Leaves:   one new inactive-then-active Scheduler staff user on a guerrillamail.com address
 */

import { expect, Page, test } from '@playwright/test';
import { portalUrl } from '../support/env';
import { failApp, failAutomation } from '../support/errors';
import { describeCheck, recordActual } from '../support/report';
import { gotoPortal, openSession, waitForShell } from '../support/session';
import { TEST_DATA } from '../support/test-data';
import { escapeRegExp, stamp } from '../support/ui';

async function tempInbox(page: Page): Promise<string> {
  await page.goto('https://www.guerrillamail.com/inbox', { waitUntil: 'domcontentloaded' });
  const captcha = page.getByText(/captcha|are you a human|access denied/i).first();
  if (await captcha.isVisible().catch(() => false)) {
    failAutomation('The temporary email website blocked the browser, so the invitation password cannot be read.');
  }
  const widget = page.locator('#email-widget').first();
  await widget.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
  const widgetText = await widget.innerText().catch(() => '');
  const email = (widgetText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0];
  if (!email) failAutomation('The temporary email website did not show an address.');
  return email;
}

async function readMailedPassword(page: Page): Promise<string> {
  const deadline = Date.now() + 70_000;
  while (Date.now() < deadline) {
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    const row = page
      .locator('#email_list tr, .email_row, table tr')
      .filter({ hasText: /nexletta|password|invitation|credential/i })
      .first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      const body = await page
        .locator('#email_body, .email_body, #display_email')
        .innerText()
        .catch(async () => page.locator('body').innerText());
      const match = body.match(/(?:temporary password|temp password|password)\s*[:\-]?\s*(\S+)/i);
      if (match?.[1]) return match[1].replace(/[.,;]+$/, '');
    }
    await page.waitForTimeout(5_000);
  }
  failApp('The invitation was checked, but the temp inbox did not receive a password.');
}

async function tryStaffLogin(page: Page, email: string, password: string): Promise<'in' | 'password' | 'denied'> {
  await page.goto(`${portalUrl('staff')}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /Email/i }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('textbox', { name: /Email/i }).fill(email);
  await page.getByRole('textbox', { name: /Password/i }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const logout = page.getByRole('button', { name: 'Logout' });
  const newPassword = page.getByRole('textbox', { name: /New password/i }).first();
  const denied = page.getByText(/invalid|incorrect|inactive|not active|denied|unauthorized|cannot sign|disabled account/i).first();
  const winner = await Promise.race([
    logout.waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'in' as const),
    newPassword.waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'password' as const),
    denied.waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'denied' as const),
  ]).catch(() => 'denied' as const);
  if (winner === 'in') await waitForShell(page);
  return winner;
}

test('NX-030 Separate account activation from invitation and identity checks', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  describeCheck(testInfo, {
    area: 'Staff / admin users',
    expected:
      'A new staff user who received an invitation cannot sign in until an admin presses Activate. After Activate, the invitation password signs in.',
    steps: [
      'Open a temporary inbox and copy its address.',
      `In Admin Users, Add User as "${TEST_DATA.newStaffUserGroup}" with that email, invitation on, and Create Account.`,
      'Confirm the new row is not Active, and send login credentials.',
      'Read the temporary password from the inbox and try to sign in. Expect denied.',
      'Press Activate on the row and confirm it shows Active.',
      'Sign in again with the same password (set a new one if asked). Expect the staff shell.',
    ],
  });

  const first = `P1${stamp()}`;
  const last = 'Staff';
  const nextPassword = `Staff#${stamp()}a`;
  const staffSession = await openSession(browser, 'ADMIN');
  const staff = staffSession.page;
  const mailContext = await browser.newContext();
  const mail = await mailContext.newPage();
  const loginContext = await browser.newContext();
  const login = await loginContext.newPage();
  try {
    const email = await tempInbox(mail);
    await expect(mail.getByText(email).first()).toBeVisible();

    await gotoPortal(staff, 'staff', '/staff/admin');
    await staff.getByRole('link', { name: 'Users', exact: true }).click();
    await staff.getByRole('button', { name: 'Add User' }).click();
    const dialog = staff.getByRole('dialog').last();
    await expect(dialog.getByText('1 Basic Info')).toBeVisible();
    await dialog.getByLabel(/User Group/i).selectOption({ label: TEST_DATA.newStaffUserGroup });
    await dialog.getByRole('textbox', { name: /First Name/i }).fill(first);
    await dialog.getByRole('textbox', { name: /Last Name/i }).fill(last);
    await dialog.getByRole('textbox', { name: /Email/i }).fill(email);
    await dialog.getByRole('button', { name: 'Next' }).click();
    const invite = dialog.getByRole('checkbox', { name: /Email an invitation/i });
    if (await invite.isVisible().catch(() => false)) await invite.check();
    let created = false;
    for (let step = 0; step < 3 && !created; step += 1) {
      const create = dialog.getByRole('button', { name: /^Create Account$/i });
      if (await create.isVisible().catch(() => false)) {
        await create.click();
        created = true;
        break;
      }
      const next = dialog.getByRole('button', { name: 'Next' });
      if (await next.isVisible().catch(() => false)) await next.click();
    }
    if (!created) failApp('Create Account was not on the new staff user form.');
    await expect(staff.getByText(email).first()).toBeVisible({ timeout: 20_000 });

    const search = staff.getByRole('textbox', { name: /Search user, email, phone/i });
    if (await search.isVisible().catch(() => false)) {
      await search.fill(email);
      await search.press('Enter');
    }
    const row = staff.locator('tr').filter({ hasText: email }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText(/^Active$/)).toHaveCount(0);

    const send = row.getByRole('button', { name: /Send login credentials/i });
    if (await send.isVisible().catch(() => false)) await send.click();
    const temporary = await readMailedPassword(mail);

    const before = await tryStaffLogin(login, email, temporary);
    expect(before, 'Inactive staff signed in before Activate').toBe('denied');
    await expect(login.getByRole('button', { name: 'Logout' })).toHaveCount(0);

    const activate = row.getByRole('button', { name: /^Activate$/i });
    await expect(activate).toBeVisible();
    await activate.click();
    await expect(row.getByText(/^Active$/)).toBeVisible({ timeout: 15_000 });

    const after = await tryStaffLogin(login, email, temporary);
    expect(after === 'in' || after === 'password', 'Activated staff could not sign in with the invitation password').toBe(true);

    const newPassword = login.getByRole('textbox', { name: /New password/i }).first();
    if (await newPassword.isVisible().catch(() => false)) {
      await newPassword.fill(nextPassword);
      const confirm = login.getByRole('textbox', { name: /Confirm/i }).first();
      if (await confirm.isVisible().catch(() => false)) await confirm.fill(nextPassword);
      await login
        .getByRole('button', { name: /Save|Set password|Update password|Continue/i })
        .first()
        .click();
      await waitForShell(login);
    }

    await expect(login.getByRole('button', { name: 'Logout' })).toBeVisible();
    await expect(login).toHaveURL(new RegExp(`^${escapeRegExp(portalUrl('staff'))}`));
    await expect(login.getByText(new RegExp(`${first}|Scheduler`, 'i')).first()).toBeVisible();

    recordActual(
      testInfo,
      `New user ${email} was denied sign-in before Activate (${before}) and reached the staff shell after Activate (${after}).`,
    );
  } finally {
    await loginContext.close();
    await mailContext.close();
    await staffSession.context.close();
  }
});
