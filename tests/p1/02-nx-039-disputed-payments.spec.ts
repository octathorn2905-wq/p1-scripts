// Order 02
// Playwright name: NX-039 Communicate disputed payments and allow correction
// Run this test only: npx playwright test -g "NX-039"

import { BrowserContext, Page, test } from '@playwright/test';
import { waitForShell } from '../helpers/session';
import { fail, gotoApp, RECORD, signedPage, stamp } from './shared';

test('NX-039 Communicate disputed payments and allow correction', async ({ browser }) => {
  test.setTimeout(360_000);
  const id = stamp();
  const reference = `yess ${id}`;
  const dispute = `not approved ${id}`;
  const corrected = `paid fee ${id}`;
  const changed = `nothing is changed ${id}`;
  const staffSession = await signedPage(browser, 'staff', 'ADMIN');
  const staff = staffSession.page;
  let veteranSession: { context: BrowserContext; page: Page } | undefined;
  try {
    await gotoApp(staff, 'staff', '/staff/cases');
    const before = await staff.locator('body').innerText();
    const known = new Set(before.match(/NXL-\d{4}-\d+/g) || []);
    await staff.getByRole('button', { name: '+ Create Case' }).click();
    const dialog = staff.getByRole('dialog').last();
    await dialog.getByLabel(/Referring Organization/).selectOption('My Org');
    await dialog.getByLabel(/Case Type/).selectOption('IME Single');
    await dialog.getByRole('button', { name: 'Select Veteran + New veteran' }).click();
    await staff.getByRole('button', { name: 'muskan aaa (VET-10009) · CLI-8006', exact: true }).click();
    const providerPick = dialog.getByLabel(/Assign Provider/);
    if (await providerPick.isVisible().catch(() => false)) await providerPick.selectOption('51').catch(() => undefined);
    await dialog.getByRole('checkbox', { name: 'Wrist', exact: true }).check();
    await dialog.getByRole('button', { name: 'Create case', exact: true }).click();
    await staff.waitForTimeout(1500);
    const created = `${staff.url()}\n${await staff.locator('body').innerText()}`;
    const caseId = (created.match(/NXL-\d{4}-\d+/g) || []).find((item) => !known.has(item)) || '';
    if (!caseId) fail('Create case did not show a new case id.');

    veteranSession = await signedPage(browser, 'veteran', 'VETERAN');
    const veteran = veteranSession.page;
    await gotoApp(veteran, 'veteran', '/veteran/case');
    await veteran.getByLabel('Filter by case').selectOption(caseId);
    await veteran.getByRole('button', { name: 'Upload documents' }).click();
    await veteran.locator('input[type="file"]').first().setInputFiles(RECORD);
    await veteran.getByRole('button', { name: 'Mark records complete' }).click();

    await staff.locator('.nxl-case-field > .form-select').selectOption('Pending Pre-Review');
    await staff.getByRole('button', { name: 'Save' }).click();
    await staff.getByRole('button', { name: 'Records Review' }).click();
    await staff.locator('select').filter({ hasText: 'Sufficient' }).first().selectOption({ label: 'Sufficient' });
    await staff.getByRole('button', { name: 'Save Pre-Review' }).click();
    await staff.waitForTimeout(1000);

    await gotoApp(veteran, 'veteran', '/veteran/billing');
    await veteran.getByLabel('Filter by case').selectOption(caseId);
    const paymentReference = veteran.getByRole('textbox', { name: 'Payment reference (optional)' });
    await paymentReference.waitFor({ state: 'visible', timeout: 20_000 });
    await paymentReference.fill(reference);
    await veteran.getByRole('button', { name: /Payment submitted for/i }).click();

    await gotoApp(staff, 'staff', '/staff/billing');
    await staff.locator('table.billing-invoices-table').waitFor({ state: 'visible', timeout: 25_000 });
    const billSearch = staff.getByRole('textbox', { name: /Search/i }).first();
    if (await billSearch.isVisible().catch(() => false)) {
      await billSearch.fill(caseId);
      await staff.waitForTimeout(800);
    }
    const rows = () => staff.locator('table.billing-invoices-table tbody tr').filter({ hasText: caseId });
    await rows().filter({ hasText: /Pre-review/i }).first().getByRole('button', { name: 'View' }).click();
    let detail = staff.getByRole('dialog').last();
    await detail.locator('.billing-detail-actions .btn-primary').click();
    await detail.getByRole('textbox', { name: 'Payment Reference' }).fill(reference);
    await detail.getByRole('button', { name: 'Mark payment received' }).click();
    await staff.waitForTimeout(800);
    await detail.getByRole('button', { name: 'Close' }).last().click().catch(() => staff.keyboard.press('Escape'));
    await staff.getByRole('dialog').last().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

    await rows().filter({ hasText: /Remainder/i }).first().getByRole('button', { name: 'View' }).click();
    detail = staff.getByRole('dialog').last();
    await detail.getByText(/Remainder/i).first().waitFor({ state: 'visible', timeout: 10_000 });
    await detail.getByRole('button', { name: 'Mark Disputed' }).click();
    await detail.getByRole('textbox', { name: 'Dispute reason' }).fill(dispute);
    await detail.getByRole('button', { name: 'Mark disputed', exact: true }).click();
    await detail.getByText(new RegExp(dispute)).first().waitFor({ state: 'visible', timeout: 15_000 });
    await detail.getByRole('button', { name: 'Close' }).last().click().catch(() => staff.keyboard.press('Escape'));

    await gotoApp(veteran, 'veteran', '/veteran/billing');
    const caseFilter = veteran.getByLabel('Filter by case');
    await caseFilter.selectOption(caseId);
    await veteran.reload({ waitUntil: 'domcontentloaded' });
    await waitForShell(veteran);
    await caseFilter.selectOption(caseId);
    const disputedBanner = veteran.locator('.banner-warn').filter({ hasText: caseId }).or(veteran.locator('.banner-warn').filter({ hasText: /Payment disputed/i })).first();
    await disputedBanner.waitFor({ state: 'visible', timeout: 20_000 });
    const correctedBox = veteran.getByRole('textbox', { name: 'Corrected payment reference' });
    const changedBox = veteran.getByRole('textbox', { name: 'What changed' });
    await correctedBox.waitFor({ state: 'visible', timeout: 15_000 });
    await changedBox.waitFor({ state: 'visible', timeout: 15_000 });
    await correctedBox.fill(corrected);
    await changedBox.fill(changed);
    await veteran.getByRole('button', { name: 'Submit corrected payment details', exact: true }).click();
    await veteran.locator('.banner-warn, .nxl-hot-toast').filter({ hasText: /submitted for verification/i }).first().waitFor({ state: 'visible', timeout: 20_000 });

    await staff.keyboard.press('Escape');
    await staff.reload({ waitUntil: 'domcontentloaded' });
    await waitForShell(staff);
    if (!staff.url().includes('/billing')) await gotoApp(staff, 'staff', '/staff/billing');
    await staff.locator('table.billing-invoices-table').waitFor({ state: 'visible', timeout: 25_000 });
    if (await billSearch.isVisible().catch(() => false)) {
      await billSearch.fill(caseId);
      await staff.waitForTimeout(800);
    }
    await rows().filter({ hasText: /Remainder/i }).first().getByRole('button', { name: 'View' }).click();
    detail = staff.getByRole('dialog').last();
    const historyBlock = detail.getByText(/^History$/i).first();
    await historyBlock.scrollIntoViewIfNeeded();
    await detail.getByText(corrected).first().waitFor({ state: 'visible', timeout: 25_000 });
    await detail.getByText(changed).first().waitFor({ state: 'visible', timeout: 10_000 });
    const history = await detail.innerText();
    if (!history.includes(corrected) || !history.includes(changed)) {
      fail(`Staff invoice history is missing the new reference or what changed. History: ${history.replace(/\s+/g, ' ').slice(0, 400)}`);
    }
    await detail.getByRole('button', { name: 'Mark as Paid' }).click();
    const paidReference = detail.getByRole('textbox', { name: 'Payment Reference' });
    const showedReference = await paidReference.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (showedReference) {
      await paidReference.fill(corrected);
      await detail.getByRole('button', { name: 'Mark payment received' }).click();
    }
    await detail.getByText(/^Paid$/).first().waitFor({ state: 'visible', timeout: 20_000 });
  } finally {
    await veteranSession?.context.close();
    await staffSession.context.close();
  }
});
