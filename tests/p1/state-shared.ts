import path from 'path';
import { Locator, Page } from '@playwright/test';
import { app, flat, open, openAdmin, readPage } from './support';


export const PROVIDER_EMAIL = 'alikhanhere2905@gmail.com';
export const PROVIDER_NAME = /^Muskan prov$/;
export const VETERAN_NAME = /muskan aaa/i;
export const VETERAN_QUERY = 'muskan aaa';
export const CLINIC_NAME = 'P1 LOC';
export const CLINIC_OPTION = /P1 LOC/i;
export const SAME_STATE = 'Texas (TX)';
export const OTHER_STATE = 'California (CA)';

export const adminState = path.join(__dirname, '.auth', 'admin.json');
export const veteranState = path.join(__dirname, '.auth', 'veteran.json');
export const providerState = path.join(__dirname, '.auth', 'provider.json');

export type Trio = { veteran: string; provider: string; clinic: string };
export type Party = 'veteran' | 'provider' | 'clinic';

export function codeOf(label: string): string {
  const code = label.match(/\(([A-Z]{2})\)/)?.[1];
  if (!code) app(`"${label}" is not a state option with a two-letter code.`);
  return code;
}

export function saysEligible(text: string): boolean {
  if (/Not eligible|Ineligible/i.test(text)) return false;
  return /\bEligible\b/i.test(text);
}

export function panelStates(text: string): Trio {
  return {
    veteran: (text.match(/Veteran:\s*([A-Z]{2})/) || [])[1] || '',
    clinic: (text.match(/Clinic:[^\n]*·\s*([A-Z]{2})/) || [])[1] || '',
    provider: (text.match(/Provider license:\s*([A-Z]{2})/) || [])[1] || '',
  };
}

export function bookDialog(page: Page): Locator {
  return page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Book appointment' }) }).last();
}

export async function chooseOption(page: Page, dialog: Locator, index: number, name: RegExp): Promise<void> {
  await dialog.getByRole('combobox').nth(index).click();
  const option = page.getByRole('option', { name }).first();
  await option.waitFor({ state: 'visible', timeout: 12_000 });
  await option.click();
  await page.waitForTimeout(400);
}

export async function selectedLabel(select: Locator): Promise<string> {
  const label = (await select.locator('option:checked').innerText()).replace(/\s+/g, ' ').trim();
  if (!label || /^Select state/i.test(label)) app('A state field is still on "Select state", so eligibility cannot be set from it.');
  return label;
}

export async function dismiss(page: Page, dialog: Locator): Promise<void> {
  const cancel = dialog.getByRole('button', { name: /^Cancel$/i }).first();
  if (await cancel.isVisible().catch(() => false)) await cancel.click();
  else await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
}

export async function commit(page: Page, dialog: Locator, changed: boolean): Promise<void> {
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
        app(`Saving the state did not close the form. ${flat(await dialog.innerText()).slice(0, 300)}`);
      }
      await page.waitForTimeout(600);
      return;
    }
    const next = dialog.getByRole('button', { name: 'Next', exact: true });
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(300);
  }
  app('The form has no Save button after the state is changed.');
}

export async function openUser(page: Page, query: string): Promise<Locator> {
  await openAdmin(page, '/staff/admin/users');
  const status = page.locator('select').filter({ hasText: 'All statuses' }).first();
  if (await status.isVisible().catch(() => false)) await status.selectOption({ label: 'All statuses' }).catch(() => undefined);
  const groups = page.locator('select').filter({ hasText: 'All user groups' }).first();
  if (await groups.isVisible().catch(() => false)) await groups.selectOption({ label: 'All user groups' }).catch(() => undefined);
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

export async function userStateSelect(page: Page, dialog: Locator, which: 'license' | 'address'): Promise<Locator> {
  for (let step = 0; step < 6; step += 1) {
    const selects = dialog.locator('select').filter({ hasText: 'Alabama (AL)' });
    if ((await selects.count()) > 0) return which === 'license' ? selects.first() : selects.last();
    const next = dialog.getByRole('button', { name: 'Next', exact: true });
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(400);
  }
  app(`Admin user settings did not show the ${which === 'license' ? 'provider license' : 'veteran'} state list.`);
}

export async function readUserState(page: Page, query: string, which: 'license' | 'address'): Promise<string> {
  const dialog = await openUser(page, query);
  const select = await userStateSelect(page, dialog, which);
  const label = await selectedLabel(select);
  await dismiss(page, dialog);
  return label;
}

export async function writeUserState(page: Page, query: string, which: 'license' | 'address', label: string): Promise<void> {
  const dialog = await openUser(page, query);
  const select = await userStateSelect(page, dialog, which);
  const current = await selectedLabel(select);
  const changed = current !== label;
  if (changed) await select.selectOption({ label });
  await commit(page, dialog, changed);
}

export async function openClinic(page: Page): Promise<{ dialog: Locator; select: Locator }> {
  await openAdmin(page, '/staff/admin/locations');
  const search = page.getByRole('textbox', { name: /Search location/i });
  if (await search.isVisible().catch(() => false)) {
    await search.fill(CLINIC_NAME);
    await page.waitForTimeout(800);
  }
  const row = page.locator('[role="row"], tr').filter({ hasText: CLINIC_NAME }).first();
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

export async function readClinicState(page: Page): Promise<string> {
  const { dialog, select } = await openClinic(page);
  const label = await selectedLabel(select);
  await dismiss(page, dialog);
  return label;
}

export async function writeClinicState(page: Page, label: string): Promise<void> {
  const { dialog, select } = await openClinic(page);
  const current = await selectedLabel(select);
  const changed = current !== label;
  if (changed) await select.selectOption({ label });
  await commit(page, dialog, changed);
}

export async function readTrio(page: Page): Promise<Trio> {
  return {
    veteran: await readUserState(page, VETERAN_QUERY, 'address'),
    provider: await readUserState(page, PROVIDER_EMAIL, 'license'),
    clinic: await readClinicState(page),
  };
}

export async function writeTrio(page: Page, states: Trio): Promise<void> {
  await writeUserState(page, VETERAN_QUERY, 'address', states.veteran);
  await writeUserState(page, PROVIDER_EMAIL, 'license', states.provider);
  await writeClinicState(page, states.clinic);
}

export async function eligibilityText(page: Page): Promise<string> {
  await open(page, 'staff', '/staff/appointments');
  await page.getByText(/Loading calendar/i).waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('menuitem', { name: 'Book appointment' }).or(page.getByText('Book appointment', { exact: true })).first().click();
  const dialog = bookDialog(page);
  await dialog.getByRole('heading', { name: 'Book appointment' }).waitFor();
  await chooseOption(page, dialog, 0, PROVIDER_NAME);
  await chooseOption(page, dialog, 1, CLINIC_OPTION);
  await chooseOption(page, dialog, 2, VETERAN_NAME);
  await page.waitForTimeout(1000);
  const text = await dialog.innerText();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  return text;
}

export function requirePanel(text: string, expected: { veteran: string; clinic: string; provider: string }, eligible: boolean, why: string): Trio {
  const seen = panelStates(text);
  if (!seen.veteran || !seen.clinic || !seen.provider) {
    app(`Booking did not show veteran, clinic, and provider states. Panel: ${flat(text).slice(0, 350)}`);
  }
  if (seen.veteran !== expected.veteran || seen.clinic !== expected.clinic || seen.provider !== expected.provider) {
    app(`${why} Expected veteran ${expected.veteran}, clinic ${expected.clinic}, provider ${expected.provider}. Saw veteran ${seen.veteran}, clinic ${seen.clinic}, provider ${seen.provider}.`);
  }
  const shown = saysEligible(text);
  if (shown !== eligible) {
    app(`${why} The form ${shown ? 'says Eligible' : 'does not say Eligible'}. Panel: ${flat(text).slice(0, 350)}`);
  }
  return seen;
}

export const ZONES: Array<{ name: RegExp; mark: RegExp }> = [
  { name: /Arizona/i, mark: /\b(AZ|Arizona)\b/i },
  { name: /Pacific/i, mark: /\b(PT|Pacific)\b/i },
  { name: /Eastern/i, mark: /\b(ET|Eastern)\b/i },
  { name: /Central/i, mark: /\b(CT|Central)\b/i },
  { name: /Mountain/i, mark: /\b(MT|Mountain)\b/i },
  { name: /Alaska/i, mark: /\b(AKT|AKST|Alaska)\b/i },
  { name: /Hawaii/i, mark: /\b(HT|HST|Hawaii)\b/i },
];

export function zoneOf(label: string): { label: string; mark: RegExp } {
  const found = ZONES.find((zone) => zone.name.test(label));
  if (!found) app(`"${label}" is not a known appointment timezone.`);
  return { label: label.replace(/\s+/g, ' ').trim(), mark: found.mark };
}

export async function timezoneSelect(page: Page): Promise<Locator> {
  const select = page.locator('select').filter({ hasText: 'Hawaii Time (UTC-10)' }).first();
  await select.waitFor({ state: 'visible', timeout: 15_000 });
  return select;
}

export async function profileTimezone(page: Page): Promise<string> {
  await open(page, 'veteran', '/veteran/profile');
  const select = page.locator('select').filter({ hasText: 'Hawaii Time (UTC-10)' }).first();
  if (await select.isVisible().catch(() => false)) {
    return (await select.locator('option:checked').innerText()).replace(/\s+/g, ' ').trim();
  }
  const text = await readPage(page);
  const labeled = text.match(/(?:Display timezone|Timezone)\s*[:\n]?\s*([^\n]+)/i)?.[1]?.trim() || '';
  if (!labeled) app('The veteran profile does not show a timezone.');
  return labeled;
}

export async function visitTimes(page: Page): Promise<string[]> {
  await page.getByText(/Loading calendar/i).waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  const events = page.locator('.rbc-event');
  await events.first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
  const chips = (await events.allInnerTexts()).map((item) => item.replace(/\s+/g, ' ').trim()).filter((item) => /\d{1,2}:\d{2}/.test(item));
  if (chips.length) return chips;
  const event = events.first();
  if (!(await event.isVisible().catch(() => false))) return [];
  await event.click();
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
  const detail = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  await dialog.getByRole('button', { name: /Close|Cancel/i }).first().click().catch(() => undefined);
  return detail ? [detail] : [];
}

