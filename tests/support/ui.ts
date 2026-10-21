import path from 'path';
import { Locator, Page } from '@playwright/test';

/** Small medical-record image used wherever a check has to upload a document. */
export const RECORD_FILE = path.resolve(__dirname, '..', 'fixtures', 'p1-record.png');

/** A short, run-unique suffix for titles, references and names the check creates. */
export function stamp(): string {
  return Date.now().toString().slice(-6);
}

/** Escape a literal (a record name, a URL) for use inside a `RegExp`. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collapse whitespace so page text can be matched and quoted in failure messages. */
export function flat(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Wait (up to 20s, never failing) for in-page loading messages to go away. */
export async function waitForContent(page: Page): Promise<void> {
  await page
    .getByText(/Please wait a moment|Loading…/i)
    .first()
    .waitFor({ state: 'hidden', timeout: 20_000 })
    .catch(() => undefined);
}

/** Whole visible page text, once in-page loading messages are gone. */
export async function readPage(page: Page): Promise<string> {
  await waitForContent(page);
  return (await page.locator('body').innerText()).replace(/ /g, ' ');
}

/** Dialog text plus the current value of every input in it, with unicode dashes normalised to `-`. */
export async function readDialog(dialog: Locator): Promise<string> {
  const text = await dialog.innerText().catch(() => '');
  const values = await dialog
    .locator('input, textarea')
    .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value || '').join('\n'))
    .catch(() => '');
  return `${text}\n${values}`.replace(/[‐-―−]/g, '-');
}

/** Text and value of the selected option in the first `<select>` whose options match `options`. Empty when none. */
export async function selectedOption(dialog: Locator, options: RegExp): Promise<string> {
  const select = dialog.locator('select').filter({ hasText: options }).first();
  if (!(await select.count())) return '';
  return select
    .evaluate((el) => {
      const node = el as HTMLSelectElement;
      const choice = node.options[node.selectedIndex];
      return `${choice?.text || ''} ${node.value}`.trim();
    })
    .catch(() => '');
}

/** Label of the checked option in a native `<select>`, whitespace collapsed. */
export async function checkedLabel(select: Locator): Promise<string> {
  return flat(await select.locator('option:checked').innerText());
}
