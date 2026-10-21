import { Locator, Page } from '@playwright/test';
import { failApp } from './errors';
import { gotoPortal } from './session';
import { checkedLabel, flat, readPage } from './ui';

/** Appointment timezones, and how a visit time printed in that zone is marked. */
const ZONES: Array<{ name: RegExp; mark: RegExp }> = [
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
  if (!found) failApp(`"${label}" is not a known appointment timezone.`);
  return { label: flat(label), mark: found.mark };
}

/** The timezone `<select>` on the current page (recognised by its Hawaii option). */
export async function timezoneSelect(page: Page): Promise<Locator> {
  const select = page.locator('select').filter({ hasText: 'Hawaii Time (UTC-10)' }).first();
  await select.waitFor({ state: 'visible', timeout: 15_000 });
  return select;
}

/** Timezone shown on the signed-in veteran's profile. */
export async function profileTimezone(page: Page): Promise<string> {
  await gotoPortal(page, 'veteran', '/veteran/profile');
  const select = page.locator('select').filter({ hasText: 'Hawaii Time (UTC-10)' }).first();
  if (await select.isVisible().catch(() => false)) return checkedLabel(select);
  const text = await readPage(page);
  const labeled = text.match(/(?:Display timezone|Timezone)\s*[:\n]?\s*([^\n]+)/i)?.[1]?.trim() || '';
  if (!labeled) failApp('The veteran profile does not show a timezone.');
  return labeled;
}

/** Visit times on the current calendar: event chip texts, or the first event's detail dialog when chips show no time. */
export async function visitTimes(page: Page): Promise<string[]> {
  await page
    .getByText(/Loading calendar/i)
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => undefined);
  const events = page.locator('.rbc-event');
  await events
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => undefined);
  const chips = (await events.allInnerTexts()).map(flat).filter((item) => /\d{1,2}:\d{2}/.test(item));
  if (chips.length) return chips;
  const event = events.first();
  if (!(await event.isVisible().catch(() => false))) return [];
  await event.click();
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
  const detail = flat(await dialog.innerText().catch(() => ''));
  await dialog
    .getByRole('button', { name: /Close|Cancel/i })
    .first()
    .click()
    .catch(() => undefined);
  return detail ? [detail] : [];
}
