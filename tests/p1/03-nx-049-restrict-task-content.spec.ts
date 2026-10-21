/**
 * NX-049 Restrict changes to other users task content
 *
 * Order:    03
 * Run only: npx playwright test -g "NX-049"
 * Signs in: ADMIN and PROVIDER (saved sessions)
 * Leaves:   one new High-priority QA task linked to the test case, In Progress, with one provider comment
 */

import { BrowserContext, Page, test } from '@playwright/test';
import { failApp } from '../support/errors';
import { describeCheck, recordActual } from '../support/report';
import { gotoPortal, openSession } from '../support/session';
import { chooseFutureDueDate, futureDateText, openTask, refreshAndOpen } from '../support/tasks';
import { TEST_DATA } from '../support/test-data';
import { escapeRegExp, flat, readDialog, selectedOption, stamp } from '../support/ui';

test('NX-049 Restrict changes to other users task content', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  describeCheck(testInfo, {
    area: 'Staff / provider tasks',
    expected:
      'A provider assigned to a task created by staff cannot change its title, priority or assignees, but can change its status and comment. Both sides see the status and comment after refresh.',
    steps: [
      `Staff: create a High ${TEST_DATA.taskCategory} task due tomorrow, linked to ${TEST_DATA.linkedCaseId}, assigned to self and ${TEST_DATA.provider.name}.`,
      'Staff: confirm the row shows the id, both assignees, High, the due date and the case.',
      'Provider: open the same task and confirm title, priority and assignees are read-only.',
      'Provider: set In Progress, post a comment, and Update status.',
      'Provider and staff: refresh, reopen the task, and see In Progress and the comment.',
    ],
  });

  const id = stamp();
  const title = `TEST CODEGEN ${id}`;
  const description = `NO DESCRIPTION FOR NOW ${id}`;
  const comment = `HELLO ${id}`;
  const dueText = futureDateText();
  const caseId = new RegExp(escapeRegExp(TEST_DATA.linkedCaseId));
  const staffSession = await openSession(browser, 'ADMIN');
  const staff = staffSession.page;
  let providerSession: { context: BrowserContext; page: Page } | undefined;
  try {
    await gotoPortal(staff, 'staff', '/staff/tasks');
    await staff.getByRole('button', { name: 'Create Task' }).click();
    const dialog = staff.getByRole('dialog').last();
    await chooseFutureDueDate(staff, dialog);
    await dialog.getByRole('textbox', { name: 'Type task title' }).fill(title);
    await staff.getByLabel('Priority:').selectOption('high');
    await staff.getByRole('button', { name: 'No linked case' }).click();
    const preferredCase = staff.getByRole('button', { name: `${TEST_DATA.linkedCaseId} — ${TEST_DATA.veteran.name}` });
    const caseButton = (await preferredCase.isVisible().catch(() => false))
      ? preferredCase
      : staff.getByRole('button', { name: new RegExp(escapeRegExp(TEST_DATA.veteran.name)) }).first();
    await caseButton.click();
    await dialog.getByRole('textbox', { name: 'Type Message/Task here...' }).fill(description);
    await dialog.getByRole('checkbox', { name: 'Assign to myself' }).check();
    const assignCombo = dialog.getByRole('checkbox', { name: 'Assign to myself' }).locator('xpath=following::*[@role="combobox"][1]');
    await assignCombo.click();
    await assignCombo.fill(TEST_DATA.provider.name.split(' ')[0]);
    const person = staff
      .locator('.ant-select-item-option-content')
      .filter({ hasText: new RegExp(`^${escapeRegExp(TEST_DATA.provider.name)}$`) })
      .last();
    await person.waitFor({ state: 'visible', timeout: 10_000 });
    await person.click();
    await dialog.getByRole('textbox', { name: 'Type task title' }).click();
    await dialog.locator('.ant-select').filter({ hasText: 'Task categories' }).first().click();
    const category = staff
      .locator('.ant-select-item-option-content')
      .filter({ hasText: new RegExp(`^${escapeRegExp(TEST_DATA.taskCategory)}$`) })
      .last();
    await category.waitFor({ state: 'visible', timeout: 8_000 });
    await category.click();
    await dialog.getByRole('textbox', { name: 'Type task title' }).click();
    await dialog.getByRole('button', { name: 'Create task', exact: true }).click();
    await staff.getByText(/Task created/i).waitFor({ state: 'visible', timeout: 15_000 });
    await staff.keyboard.press('Escape');
    await staff
      .locator('.nxl-hot-toast')
      .first()
      .waitFor({ state: 'hidden', timeout: 8_000 })
      .catch(() => undefined);

    const search = staff.getByRole('textbox', { name: 'Search', exact: true });
    await search.fill(title);
    await search.press('Enter');
    await staff.waitForTimeout(800);
    const staffRow = staff.locator('tr').filter({ hasText: title }).first();
    await staffRow.waitFor({ state: 'visible', timeout: 20_000 });
    const staffRowText = await staffRow.innerText();
    const taskId = (staffRowText.match(/TSK-\d+/) || [''])[0];
    if (!taskId) failApp(`Staff did not generate a task id. Row: ${flat(staffRowText).slice(0, 180)}`);
    const assignees = [TEST_DATA.provider.name, TEST_DATA.adminName].map((name) => new RegExp(escapeRegExp(name), 'i'));
    if (!assignees.every((name) => name.test(staffRowText))) {
      failApp('The saved task is missing an assignee.');
    }
    if (!/High/i.test(staffRowText)) failApp('The saved task is missing priority High.');
    if (!staffRowText.includes(dueText)) failApp(`The saved due date is not the future date ${dueText}.`);
    if (!caseId.test(staffRowText)) failApp('The saved task is missing the linked case.');

    providerSession = await openSession(browser, 'PROVIDER');
    const provider = providerSession.page;
    await gotoPortal(provider, 'provider', '/provider/tasks');
    const providerSearch = provider.getByRole('textbox', { name: 'Search', exact: true });
    await providerSearch.fill(title);
    await providerSearch.press('Enter');
    await provider.waitForTimeout(800);
    let providerDialog = await openTask(provider, taskId);
    const providerOpen = await readDialog(providerDialog);
    const priorityChosen = await selectedOption(providerDialog, /High|Medium|Low|Urgent/);
    if (!providerOpen.includes(taskId) || !providerOpen.includes(title)) {
      failApp(`The provider opened a different task. Dialog: ${flat(providerOpen).slice(0, 220)}`);
    }
    if (!/High/i.test(priorityChosen || providerOpen) || !caseId.test(providerOpen)) {
      failApp('The provider task does not show the same priority and linked case.');
    }

    const titleBox = providerDialog.getByRole('textbox', { name: /Type task title|^Title/i }).first();
    if ((await titleBox.isVisible().catch(() => false)) && (await titleBox.isEditable().catch(() => false))) {
      failApp('The provider can edit the title.');
    }
    const priority = providerDialog.getByLabel(/Priority/i).first();
    if (await priority.count()) {
      const isControl = await priority
        .evaluate((el) => el.tagName === 'SELECT' || el.getAttribute('role') === 'combobox')
        .catch(() => false);
      const enabled = await priority.isEnabled().catch(() => false);
      const editable = await priority.isEditable().catch(() => false);
      if (isControl && enabled && editable) failApp('The provider can edit the priority.');
    }
    const assignGroup = providerDialog.getByRole('radiogroup', { name: /Assign to/i });
    const radios = assignGroup.getByRole('radio');
    const radioCount = await radios.count();
    if (!radioCount) failApp('The assignee control was not on the provider task.');
    for (let i = 0; i < radioCount; i += 1) {
      if (await radios.nth(i).isEnabled()) failApp('The provider can edit the assignee.');
    }

    await providerDialog
      .locator('select')
      .filter({ hasText: /In Progress/ })
      .first()
      .selectOption('started');
    await provider.getByRole('textbox', { name: /Add a comment/i }).fill(comment);
    await provider.getByRole('button', { name: 'Post comment' }).click();
    await provider.getByRole('button', { name: 'Update status' }).click();
    await provider
      .getByText(comment)
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => undefined);

    providerDialog = await refreshAndOpen(provider, 'provider', taskId);
    const providerAfter = await readDialog(providerDialog);
    const providerStatus = await selectedOption(providerDialog, /In Progress|Open|Completed/);
    if (!providerAfter.includes(comment)) failApp('After refresh, the comment is not inside the provider task.');
    if (!/In Progress/i.test(providerStatus)) failApp('After refresh, In Progress is not inside the provider task.');

    const staffDialog = await refreshAndOpen(staff, 'staff', taskId);
    const staffAfter = await readDialog(staffDialog);
    const staffStatus = await selectedOption(staffDialog, /In Progress|Open|Completed/);
    if (!/In Progress/i.test(`${staffStatus}\n${staffAfter}`) && !/Status changed to started/i.test(staffAfter)) {
      failApp('After refresh, Staff does not show In Progress inside the task.');
    }
    if (!staffAfter.includes(comment)) failApp('After refresh, Staff does not show the provider comment inside the task.');

    recordActual(
      testInfo,
      `Task ${taskId}: the provider could not edit title, priority or assignees, set In Progress and commented "${comment}". Both portals show both after refresh.`,
    );
  } finally {
    await providerSession?.context.close();
    await staffSession.context.close();
  }
});
