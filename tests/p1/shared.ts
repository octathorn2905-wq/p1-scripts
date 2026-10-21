import path from 'path';
import { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { Portal, RoleKey, SmokeError, portalUrl } from '../helpers/env';
import { signIn, waitForShell } from '../helpers/session';

export const RECORD = path.join(__dirname, 'fixtures', 'p1-record.png');

export function fail(message: string): never {
  throw new SmokeError('application', message);
}

export function stamp(): string {
  return Date.now().toString().slice(-6);
}

export function tomorrow(): Date {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function futureDateText(): string {
  const day = tomorrow();
  return `${day.getMonth() + 1}/${day.getDate()}/${day.getFullYear()}`;
}

export async function gotoApp(page: Page, portal: Portal, route: string): Promise<void> {
  await page.goto(`${portalUrl(portal)}${route}`, { waitUntil: 'domcontentloaded' });
  await waitForShell(page);
}

export async function signedPage(browser: Browser, portal: Portal, role: RoleKey): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, portal, role);
  return { context, page };
}

export async function chooseFutureDueDate(page: Page, dialog: Locator): Promise<void> {
  const due = dialog.getByRole('textbox', { name: 'Due Date' });
  if (!(await due.isVisible().catch(() => false))) return;
  const day = tomorrow();
  const month = day.toLocaleString('en-US', { month: 'long' });
  const dayNumber = day.getDate();
  const ordinal = dayNumber % 10 === 1 && dayNumber !== 11 ? 'st' : dayNumber % 10 === 2 && dayNumber !== 12 ? 'nd' : dayNumber % 10 === 3 && dayNumber !== 13 ? 'rd' : 'th';
  const futureDay = new RegExp(`Choose .+, ${month} ${dayNumber}${ordinal}, ${day.getFullYear()}`);
  await due.click();
  let cell = page.getByRole('gridcell', { name: futureDay }).first();
  if (!(await cell.isVisible().catch(() => false))) {
    const nextMonth = page.getByRole('button', { name: 'Next month' });
    if (await nextMonth.isVisible().catch(() => false)) await nextMonth.click();
    cell = page.getByRole('gridcell', { name: futureDay }).first();
  }
  if (await cell.isVisible().catch(() => false)) await cell.click();
  else await page.keyboard.press('Escape');
}

export async function readDialog(dialog: Locator): Promise<string> {
  const text = await dialog.innerText().catch(() => '');
  const values = await dialog.locator('input, textarea').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value || '').join('\n')).catch(() => '');
  return `${text}\n${values}`.replace(/[\u2010-\u2015\u2212]/g, '-');
}

export async function openTask(page: Page, taskId: string): Promise<Locator> {
  const row = page.locator('tr').filter({ hasText: taskId }).first();
  await row.waitFor({ state: 'visible', timeout: 20_000 });
  await row.getByText(taskId, { exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: /Comments|Update status|Post comment/i }).last();
  await dialog.waitFor({ state: 'visible', timeout: 20_000 });
  await dialog.locator('.modal-title').first().scrollIntoViewIfNeeded().catch(() => undefined);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const header = await readDialog(dialog);
    const titleValue = await dialog.locator('input').first().inputValue().catch(() => '');
    if (header.includes(taskId) && titleValue.trim() && !/Task - Loading/i.test(header)) return dialog;
    await page.waitForTimeout(400);
  }
  return dialog;
}

export async function selectedOption(dialog: Locator, options: RegExp): Promise<string> {
  const select = dialog.locator('select').filter({ hasText: options }).first();
  if (!(await select.count())) return '';
  return select.evaluate((el) => {
    const node = el as HTMLSelectElement;
    const choice = node.options[node.selectedIndex];
    return `${choice?.text || ''} ${node.value}`.trim();
  }).catch(() => '');
}

export async function refreshAndOpen(page: Page, portal: Portal, taskId: string): Promise<Locator> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForShell(page);
  if (!page.url().includes('/tasks')) await gotoApp(page, portal, portal === 'staff' ? '/staff/tasks' : '/provider/tasks');
  const search = page.getByRole('textbox', { name: 'Search', exact: true });
  if (await search.isVisible().catch(() => false)) {
    await search.fill(taskId);
    await search.press('Enter');
    await page.waitForTimeout(800);
  }
  return openTask(page, taskId);
}
