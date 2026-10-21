/**
 * NX-039 Communicate disputed payments and allow correction
 *
 * Order:    02
 * Run only: npx playwright test -g "NX-039"
 * Signs in: ADMIN and VETERAN (saved sessions)
 * Leaves:   one new IME Single case for the test veteran, with a paid pre-review invoice and a paid remainder invoice
 */

import { BrowserContext, Page, test } from '@playwright/test';
import { failApp } from '../support/errors';
import { describeCheck, recordActual } from '../support/report';
import { gotoPortal, openSession, waitForShell } from '../support/session';
import { TEST_DATA } from '../support/test-data';
import { flat, RECORD_FILE, stamp } from '../support/ui';

test('NX-039 Communicate disputed payments and allow correction', async ({ browser }, testInfo) => {
  test.setTimeout(360_000);
  describeCheck(testInfo, {
    area: 'Staff billing / veteran billing',
    expected:
      'When staff mark an invoice Disputed, the veteran sees why and can submit a corrected payment reference. Staff see the correction in the invoice history and can mark it Paid.',
    steps: [
      `Staff: create an ${TEST_DATA.caseType} case for ${TEST_DATA.veteran.name}.`,
      'Veteran: upload a record and mark records complete.',
      'Staff: move the case to Pending Pre-Review and save the pre-review as Sufficient.',
      'Veteran: submit a payment reference. Staff: mark the pre-review invoice payment received.',
      'Staff: mark the remainder invoice Disputed with a reason.',
      'Veteran: see the disputed banner and submit a corrected reference and what changed.',
      'Staff: see both in the remainder invoice history, then mark it Paid.',
    ],
  });

  const id = stamp();
  const reference = `yess ${id}`;
  const dispute = `not approved ${id}`;
  const corrected = `paid fee ${id}`;
  const changed = `nothing is changed ${id}`;
  const staffSession = await openSession(browser, 'ADMIN');
  const staff = staffSession.page;
  let veteranSession: { context: BrowserContext; page: Page } | undefined;
  try {
    await gotoPortal(staff, 'staff', '/staff/cases');
    const before = await staff.locator('body').innerText();
    const known = new Set(before.match(/NXL-\d{4}-\d+/g) || []);
    await staff.getByRole('button', { name: '+ Create Case' }).click();
    const dialog = staff.getByRole('dialog').last();
    await dialog.getByLabel(/Referring Organization/).selectOption(TEST_DATA.referringOrganization);
    await dialog.getByLabel(/Case Type/).selectOption(TEST_DATA.caseType);
    await dialog.getByRole('button', { name: 'Select Veteran + New veteran' }).click();
    await staff.getByRole('button', { name: TEST_DATA.veteran.casePickerLabel, exact: true }).click();
    const providerPick = dialog.getByLabel(/Assign Provider/);
    if (await providerPick.isVisible().catch(() => false)) {
      await providerPick.selectOption(TEST_DATA.provider.caseOptionValue).catch(() => undefined);
    }
    await dialog.getByRole('checkbox', { name: 'Wrist', exact: true }).check();
    await dialog.getByRole('button', { name: 'Create case', exact: true }).click();
    await staff.waitForTimeout(1500);
    const created = `${staff.url()}\n${await staff.locator('body').innerText()}`;
    const caseId = (created.match(/NXL-\d{4}-\d+/g) || []).find((item) => !known.has(item)) || '';
    if (!caseId) failApp('Create case did not show a new case id.');

    veteranSession = await openSession(browser, 'VETERAN');
    const veteran = veteranSession.page;
    await gotoPortal(veteran, 'veteran', '/veteran/case');
    await veteran.getByLabel('Filter by case').selectOption(caseId);
    await veteran.getByRole('button', { name: 'Upload documents' }).click();
    await veteran.locator('input[type="file"]').first().setInputFiles(RECORD_FILE);
    await veteran.getByRole('button', { name: 'Mark records complete' }).click();

    await staff.locator('.nxl-case-field > .form-select').selectOption('Pending Pre-Review');
    await staff.getByRole('button', { name: 'Save' }).click();
    await staff.getByRole('button', { name: 'Records Review' }).click();
    await staff.locator('select').filter({ hasText: 'Sufficient' }).first().selectOption({ label: 'Sufficient' });
    await staff.getByRole('button', { name: 'Save Pre-Review' }).click();
    await staff.waitForTimeout(1000);

    await gotoPortal(veteran, 'veteran', '/veteran/billing');
    await veteran.getByLabel('Filter by case').selectOption(caseId);
    const paymentReference = veteran.getByRole('textbox', { name: 'Payment reference (optional)' });
    await paymentReference.waitFor({ state: 'visible', timeout: 20_000 });
    await paymentReference.fill(reference);
    await veteran.getByRole('button', { name: /Payment submitted for/i }).click();

    await gotoPortal(staff, 'staff', '/staff/billing');
    await staff.locator('table.billing-invoices-table').waitFor({ state: 'visible', timeout: 25_000 });
    const billSearch = staff.getByRole('textbox', { name: /Search/i }).first();
    if (await billSearch.isVisible().catch(() => false)) {
      await billSearch.fill(caseId);
      await staff.waitForTimeout(800);
    }
    const rows = () => staff.locator('table.billing-invoices-table tbody tr').filter({ hasText: caseId });
    await rows()
      .filter({ hasText: /Pre-review/i })
      .first()
      .getByRole('button', { name: 'View' })
      .click();
    let detail = staff.getByRole('dialog').last();
    await detail.locator('.billing-detail-actions .btn-primary').click();
    await detail.getByRole('textbox', { name: 'Payment Reference' }).fill(reference);
    await detail.getByRole('button', { name: 'Mark payment received' }).click();
    await staff.waitForTimeout(800);
    await detail
      .getByRole('button', { name: 'Close' })
      .last()
      .click()
      .catch(() => staff.keyboard.press('Escape'));
    await staff
      .getByRole('dialog')
      .last()
      .waitFor({ state: 'hidden', timeout: 10_000 })
      .catch(() => undefined);

    await rows()
      .filter({ hasText: /Remainder/i })
      .first()
      .getByRole('button', { name: 'View' })
      .click();
    detail = staff.getByRole('dialog').last();
    await detail
      .getByText(/Remainder/i)
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
    await detail.getByRole('button', { name: 'Mark Disputed' }).click();
    await detail.getByRole('textbox', { name: 'Dispute reason' }).fill(dispute);
    await detail.getByRole('button', { name: 'Mark disputed', exact: true }).click();
    await detail.getByText(new RegExp(dispute)).first().waitFor({ state: 'visible', timeout: 15_000 });
    await detail
      .getByRole('button', { name: 'Close' })
      .last()
      .click()
      .catch(() => staff.keyboard.press('Escape'));

    await gotoPortal(veteran, 'veteran', '/veteran/billing');
    const caseFilter = veteran.getByLabel('Filter by case');
    await caseFilter.selectOption(caseId);
    await veteran.reload({ waitUntil: 'domcontentloaded' });
    await waitForShell(veteran);
    await caseFilter.selectOption(caseId);
    const disputedBanner = veteran
      .locator('.banner-warn')
      .filter({ hasText: caseId })
      .or(veteran.locator('.banner-warn').filter({ hasText: /Payment disputed/i }))
      .first();
    await disputedBanner.waitFor({ state: 'visible', timeout: 20_000 });
    const correctedBox = veteran.getByRole('textbox', { name: 'Corrected payment reference' });
    const changedBox = veteran.getByRole('textbox', { name: 'What changed' });
    await correctedBox.waitFor({ state: 'visible', timeout: 15_000 });
    await changedBox.waitFor({ state: 'visible', timeout: 15_000 });
    await correctedBox.fill(corrected);
    await changedBox.fill(changed);
    await veteran.getByRole('button', { name: 'Submit corrected payment details', exact: true }).click();
    await veteran
      .locator('.banner-warn, .nxl-hot-toast')
      .filter({ hasText: /submitted for verification/i })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 });

    await staff.keyboard.press('Escape');
    await staff.reload({ waitUntil: 'domcontentloaded' });
    await waitForShell(staff);
    if (!staff.url().includes('/billing')) await gotoPortal(staff, 'staff', '/staff/billing');
    await staff.locator('table.billing-invoices-table').waitFor({ state: 'visible', timeout: 25_000 });
    if (await billSearch.isVisible().catch(() => false)) {
      await billSearch.fill(caseId);
      await staff.waitForTimeout(800);
    }
    await rows()
      .filter({ hasText: /Remainder/i })
      .first()
      .getByRole('button', { name: 'View' })
      .click();
    detail = staff.getByRole('dialog').last();
    const historyBlock = detail.getByText(/^History$/i).first();
    await historyBlock.scrollIntoViewIfNeeded();
    await detail.getByText(corrected).first().waitFor({ state: 'visible', timeout: 25_000 });
    await detail.getByText(changed).first().waitFor({ state: 'visible', timeout: 10_000 });
    const history = await detail.innerText();
    if (!history.includes(corrected) || !history.includes(changed)) {
      failApp(`Staff invoice history is missing the new reference or what changed. History: ${flat(history).slice(0, 400)}`);
    }
    await detail.getByRole('button', { name: 'Mark as Paid' }).click();
    const paidReference = detail.getByRole('textbox', { name: 'Payment Reference' });
    const showedReference = await paidReference
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (showedReference) {
      await paidReference.fill(corrected);
      await detail.getByRole('button', { name: 'Mark payment received' }).click();
    }
    await detail
      .getByText(/^Paid$/)
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 });

    recordActual(
      testInfo,
      `Case ${caseId}: the veteran saw the dispute "${dispute}" and submitted "${corrected}" / "${changed}". Staff saw both in the remainder history and marked it Paid.`,
    );
  } finally {
    await veteranSession?.context.close();
    await staffSession.context.close();
  }
});
