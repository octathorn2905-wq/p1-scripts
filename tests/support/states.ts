import { Locator, Page } from '@playwright/test';
import { credentials } from './env';
import { failApp } from './errors';
import { gotoPortal } from './session';
import { TEST_DATA } from './test-data';
import { checkedLabel, escapeRegExp, flat } from './ui';

/** State labels, e.g. `Texas (TX)`, for the three parties STATE-MATCH compares. */
export type Trio = { veteran: string; provider: string; clinic: string };

type UserState = 'license' | 'address';

/** Admin Users rows are found by the veteran's name and the provider's sign-in email. */
const veteranQuery = (): string => TEST_DATA.veteran.name;
const providerQuery = (): string => credentials('PROVIDER').email;

/** `Texas (TX)` → `TX`. */
export function codeOf(label: string): string {
  const code = label.match(/\(([A-Z]{2})\)/)?.[1];
  if (!code) failApp(`"${label}" is not a state option with a two-letter code.`);
  return code;
}

export function saysEligible(text: string): boolean {
  if (/Not eligible|Ineligible/i.test(text)) return false;
  return /\bEligible\b/i.test(text);
}

/** State codes printed in the Book appointment eligibility panel. Empty string when a party is missing. */
export function panelStates(text: string): Trio {
  return {
    veteran: (text.match(/Veteran:\s*([A-Z]{2})/) || [])[1] || '',
    clinic: (text.match(/Clinic:[^\n]*·\s*([A-Z]{2})/) || [])[1] || '',
    provider: (text.match(/Provider license:\s*([A-Z]{2})/) || [])[1] || '',
  };
}

function bookDialog(page: Page): Locator {
  return page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'Book appointment' }) })
    .last();
}

async function chooseOption(page: Page, dialog: Locator, index: number, name: RegExp): Promise<void> {
  await dialog.getByRole('combobox').nth(index).click();
  const option = page.getByRole('option', { name }).first();
  await option.waitFor({ state: 'visible', timeout: 12_000 });
  await option.click();
  await page.waitForTimeout(400);
}

async function selectedState(select: Locator): Promise<string> {
  const label = await checkedLabel(select);
  if (!label || /^Select state/i.test(label)) {
    failApp('A state field is still on "Select state", so eligibility cannot be set from it.');
  }
  return label;
}

async function dismiss(page: Page, dialog: Locator): Promise<void> {
  const cancel = dialog.getByRole('button', { name: /^Cancel$/i }).first();
  if (await cancel.isVisible().catch(() => false)) await cancel.click();
  else await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
}

/** Save a multi-step admin form (stepping through Next until Save appears), or cancel it when nothing changed. */
async function commit(page: Page, dialog: Locator, changed: boolean): Promise<void> {
  if (!changed) {
    await dismiss(page, dialog);
    return;
  }
  for (let step = 0; step < 6; step += 1) {
    const save = dialog.getByRole('button', { name: /Save Changes|^Save$/i }).last();
    if (await save.isVisible().catch(() => false)) {
      await save.click();
      try {
        await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
      } catch {
        failApp(`Saving the state did not close the form. ${flat(await dialog.innerText()).slice(0, 300)}`);
      }
      await page.waitForTimeout(600);
      return;
    }
    const next = dialog.getByRole('button', { name: 'Next', exact: true });
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(300);
  }
  failApp('The form has no Save button after the state is changed.');
}

async function openUser(page: Page, query: string): Promise<Locator> {
  await gotoPortal(page, 'staff', '/staff/admin/users');
  const status = page.locator('select').filter({ hasText: 'All statuses' }).first();
  if (await status.isVisible().catch(() => false)) {
    await status.selectOption({ label: 'All statuses' }).catch(() => undefined);
  }
  const groups = page.locator('select').filter({ hasText: 'All user groups' }).first();
  if (await groups.isVisible().catch(() => false)) {
    await groups.selectOption({ label: 'All user groups' }).catch(() => undefined);
  }
  await page.getByRole('textbox', { name: /Search user/i }).fill(query);
  await page.waitForTimeout(900);
  const row = page.locator('[role="row"], tr').filter({ hasText: query }).first();
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  const edit = row.getByRole('button', { name: /Edit/i }).first();
  if (await edit.isVisible().catch(() => false)) await edit.click();
  else await row.locator('button').first().click();
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  return dialog;
}

async function userStateSelect(page: Page, dialog: Locator, which: UserState): Promise<Locator> {
  for (let step = 0; step < 6; step += 1) {
    const selects = dialog.locator('select').filter({ hasText: 'Alabama (AL)' });
    if ((await selects.count()) > 0) return which === 'license' ? selects.first() : selects.last();
    const next = dialog.getByRole('button', { name: 'Next', exact: true });
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(400);
  }
  failApp(`Admin user settings did not show the ${which === 'license' ? 'provider license' : 'veteran'} state list.`);
}

async function readUserState(page: Page, query: string, which: UserState): Promise<string> {
  const dialog = await openUser(page, query);
  const select = await userStateSelect(page, dialog, which);
  const label = await selectedState(select);
  await dismiss(page, dialog);
  return label;
}

async function writeUserState(page: Page, query: string, which: UserState, label: string): Promise<void> {
  const dialog = await openUser(page, query);
  const select = await userStateSelect(page, dialog, which);
  const changed = (await selectedState(select)) !== label;
  if (changed) await select.selectOption({ label });
  await commit(page, dialog, changed);
}

/** Set the veteran's address state in Admin Users. */
export async function writeVeteranState(page: Page, label: string): Promise<void> {
  await writeUserState(page, veteranQuery(), 'address', label);
}

/** Set the provider's license state in Admin Users. */
export async function writeProviderState(page: Page, label: string): Promise<void> {
  await writeUserState(page, providerQuery(), 'license', label);
}

async function openClinic(page: Page): Promise<{ dialog: Locator; select: Locator }> {
  await gotoPortal(page, 'staff', '/staff/admin/locations');
  const search = page.getByRole('textbox', { name: /Search location/i });
  if (await search.isVisible().catch(() => false)) {
    await search.fill(TEST_DATA.clinic);
    await page.waitForTimeout(800);
  }
  const row = page.locator('[role="row"], tr').filter({ hasText: TEST_DATA.clinic }).first();
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  const edit = row.getByRole('button', { name: /Edit/i }).first();
  if (await edit.isVisible().catch(() => false)) await edit.click();
  else await row.locator('button').last().click();
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  const select = dialog.locator('select').filter({ hasText: 'Alabama (AL)' }).last();
  await select.waitFor({ state: 'visible', timeout: 10_000 });
  return { dialog, select };
}

async function readClinicState(page: Page): Promise<string> {
  const { dialog, select } = await openClinic(page);
  const label = await selectedState(select);
  await dismiss(page, dialog);
  return label;
}

/** Set the clinic location's state in Admin Locations. */
export async function writeClinicState(page: Page, label: string): Promise<void> {
  const { dialog, select } = await openClinic(page);
  const changed = (await selectedState(select)) !== label;
  if (changed) await select.selectOption({ label });
  await commit(page, dialog, changed);
}

export async function readTrio(page: Page): Promise<Trio> {
  return {
    veteran: await readUserState(page, veteranQuery(), 'address'),
    provider: await readUserState(page, providerQuery(), 'license'),
    clinic: await readClinicState(page),
  };
}

export async function writeTrio(page: Page, states: Trio): Promise<void> {
  await writeVeteranState(page, states.veteran);
  await writeProviderState(page, states.provider);
  await writeClinicState(page, states.clinic);
}

/** Open Book appointment for the test provider, clinic and veteran, read the eligibility panel, then cancel. */
export async function eligibilityText(page: Page): Promise<string> {
  await gotoPortal(page, 'staff', '/staff/appointments');
  await page
    .getByText(/Loading calendar/i)
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => undefined);
  await page.getByRole('button', { name: 'Add' }).click();
  await page
    .getByRole('menuitem', { name: 'Book appointment' })
    .or(page.getByText('Book appointment', { exact: true }))
    .first()
    .click();
  const dialog = bookDialog(page);
  await dialog.getByRole('heading', { name: 'Book appointment' }).waitFor();
  await chooseOption(page, dialog, 0, new RegExp(`^${escapeRegExp(TEST_DATA.provider.name)}$`));
  await chooseOption(page, dialog, 1, new RegExp(escapeRegExp(TEST_DATA.clinic), 'i'));
  await chooseOption(page, dialog, 2, new RegExp(escapeRegExp(TEST_DATA.veteran.name), 'i'));
  await page.waitForTimeout(1000);
  const text = await dialog.innerText();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  return text;
}

/** Fail unless the eligibility panel shows exactly `expected` and the expected Eligible / Not eligible verdict. */
export function requirePanel(text: string, expected: Trio, eligible: boolean, why: string): Trio {
  const seen = panelStates(text);
  if (!seen.veteran || !seen.clinic || !seen.provider) {
    failApp(`Booking did not show veteran, clinic, and provider states. Panel: ${flat(text).slice(0, 350)}`);
  }
  if (seen.veteran !== expected.veteran || seen.clinic !== expected.clinic || seen.provider !== expected.provider) {
    failApp(
      `${why} Expected veteran ${expected.veteran}, clinic ${expected.clinic}, provider ${expected.provider}. Saw veteran ${seen.veteran}, clinic ${seen.clinic}, provider ${seen.provider}.`,
    );
  }
  const shown = saysEligible(text);
  if (shown !== eligible) {
    failApp(`${why} The form ${shown ? 'says Eligible' : 'does not say Eligible'}. Panel: ${flat(text).slice(0, 350)}`);
  }
  return seen;
}
