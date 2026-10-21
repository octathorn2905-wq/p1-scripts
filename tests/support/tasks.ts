import { Locator, Page } from '@playwright/test';
import { Portal } from './env';
import { gotoPortal, waitForShell } from './session';
import { readDialog } from './ui';

/** Local midnight tomorrow. Task due dates must be in the future. */
export function tomorrow(): Date {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Tomorrow as the task list prints it, e.g. `10/22/2026`. */
export function futureDateText(): string {
  const day = tomorrow();
  return `${day.getMonth() + 1}/${day.getDate()}/${day.getFullYear()}`;
}

/** Pick tomorrow in the task dialog's Due Date picker. Does nothing when the dialog has no Due Date. */
export async function chooseFutureDueDate(page: Page, dialog: Locator): Promise<void> {
  const due = dialog.getByRole('textbox', { name: 'Due Date' });
  if (!(await due.isVisible().catch(() => false))) return;
  const day = tomorrow();
  const month = day.toLocaleString('en-US', { month: 'long' });
  const dayNumber = day.getDate();
  const ordinal =
    dayNumber % 10 === 1 && dayNumber !== 11
      ? 'st'
      : dayNumber % 10 === 2 && dayNumber !== 12
        ? 'nd'
        : dayNumber % 10 === 3 && dayNumber !== 13
          ? 'rd'
          : 'th';
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

/** Open a task from the task list by its `TSK-…` id and wait until the dialog has loaded that task. */
export async function openTask(page: Page, taskId: string): Promise<Locator> {
  const row = page.locator('tr').filter({ hasText: taskId }).first();
  await row.waitFor({ state: 'visible', timeout: 20_000 });
  await row.getByText(taskId, { exact: true }).click();
  const dialog = page
    .getByRole('dialog')
    .filter({ hasText: /Comments|Update status|Post comment/i })
    .last();
  await dialog.waitFor({ state: 'visible', timeout: 20_000 });
  await dialog
    .locator('.modal-title')
    .first()
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const header = await readDialog(dialog);
    const titleValue = await dialog
      .locator('input')
      .first()
      .inputValue()
      .catch(() => '');
    if (header.includes(taskId) && titleValue.trim() && !/Task - Loading/i.test(header)) return dialog;
    await page.waitForTimeout(400);
  }
  return dialog;
}

/** Reload, return to the portal's task list, search for the task and open it again. Proves a change was saved. */
export async function refreshAndOpen(page: Page, portal: Portal, taskId: string): Promise<Locator> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForShell(page);
  if (!page.url().includes('/tasks')) await gotoPortal(page, portal, portal === 'staff' ? '/staff/tasks' : '/provider/tasks');
  const search = page.getByRole('textbox', { name: 'Search', exact: true });
  if (await search.isVisible().catch(() => false)) {
    await search.fill(taskId);
    await search.press('Enter');
    await page.waitForTimeout(800);
  }
  return openTask(page, taskId);
}
