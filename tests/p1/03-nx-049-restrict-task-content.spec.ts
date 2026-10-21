// Order 03
// Playwright name: NX-049 Restrict changes to other users task content
// Run this test only: npx playwright test -g "NX-049"

import { BrowserContext, Page, test } from '@playwright/test';
import { chooseFutureDueDate, fail, futureDateText, gotoApp, openTask, readDialog, refreshAndOpen, selectedOption, signedPage, stamp } from './shared';

test('NX-049 Restrict changes to other users task content', async ({ browser }) => {
  test.setTimeout(300_000);
  const title = `TEST CODEGEN ${stamp()}`;
  const description = `NO DESCRIPTION FOR NOW ${stamp()}`;
  const comment = `HELLO ${stamp()}`;
  const dueText = futureDateText();
  const staffSession = await signedPage(browser, 'staff', 'ADMIN');
  const staff = staffSession.page;
  let providerSession: { context: BrowserContext; page: Page } | undefined;
  try {
    await gotoApp(staff, 'staff', '/staff/tasks');
    await staff.getByRole('button', { name: 'Create Task' }).click();
    const dialog = staff.getByRole('dialog').last();
    await chooseFutureDueDate(staff, dialog);
    await dialog.getByRole('textbox', { name: 'Type task title' }).fill(title);
    await staff.getByLabel('Priority:').selectOption('high');
    await staff.getByRole('button', { name: 'No linked case' }).click();
    const preferredCase = staff.getByRole('button', { name: 'NXL-2026-0327 — muskan aaa' });
    const caseButton = (await preferredCase.isVisible().catch(() => false))
      ? preferredCase
      : staff.getByRole('button', { name: /muskan aaa/ }).first();
    await caseButton.click();
    await dialog.getByRole('textbox', { name: 'Type Message/Task here...' }).fill(description);
    await dialog.getByRole('checkbox', { name: 'Assign to myself' }).check();
    const assignCombo = dialog.getByRole('checkbox', { name: 'Assign to myself' }).locator('xpath=following::*[@role="combobox"][1]');
    await assignCombo.click();
    await assignCombo.fill('Muskan');
    const person = staff.locator('.ant-select-item-option-content').filter({ hasText: /^Muskan prov$/ }).last();
    await person.waitFor({ state: 'visible', timeout: 10_000 });
    await person.click();
    await dialog.getByRole('textbox', { name: 'Type task title' }).click();
    await dialog.locator('.ant-select').filter({ hasText: 'Task categories' }).first().click();
    const qa = staff.locator('.ant-select-item-option-content').filter({ hasText: /^QA$/ }).last();
    await qa.waitFor({ state: 'visible', timeout: 8_000 });
    await qa.click();
    await dialog.getByRole('textbox', { name: 'Type task title' }).click();
    await dialog.getByRole('button', { name: 'Create task', exact: true }).click();
    await staff.getByText(/Task created/i).waitFor({ state: 'visible', timeout: 15_000 });
    await staff.keyboard.press('Escape');
    await staff.locator('.nxl-hot-toast').first().waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => undefined);

    const search = staff.getByRole('textbox', { name: 'Search', exact: true });
    await search.fill(title);
    await search.press('Enter');
    await staff.waitForTimeout(800);
    const staffRow = staff.locator('tr').filter({ hasText: title }).first();
    await staffRow.waitFor({ state: 'visible', timeout: 20_000 });
    const staffRowText = await staffRow.innerText();
    const taskId = (staffRowText.match(/TSK-\d+/) || [''])[0];
    if (!taskId) fail(`Staff did not generate a task id. Row: ${staffRowText.replace(/\s+/g, ' ').slice(0, 180)}`);
    if (!/Muskan prov/i.test(staffRowText) || !/Jordan Ellis/i.test(staffRowText)) fail('The saved task is missing an assignee.');
    if (!/High/i.test(staffRowText)) fail('The saved task is missing priority High.');
    if (!staffRowText.includes(dueText)) fail(`The saved due date is not the future date ${dueText}.`);
    if (!/NXL-2026-0327/.test(staffRowText)) fail('The saved task is missing the linked case.');

    providerSession = await signedPage(browser, 'provider', 'PROVIDER');
    const provider = providerSession.page;
    await gotoApp(provider, 'provider', '/provider/tasks');
    const providerSearch = provider.getByRole('textbox', { name: 'Search', exact: true });
    await providerSearch.fill(title);
    await providerSearch.press('Enter');
    await provider.waitForTimeout(800);
    let providerDialog = await openTask(provider, taskId);
    const providerOpen = await readDialog(providerDialog);
    const priorityChosen = await selectedOption(providerDialog, /High|Medium|Low|Urgent/);
    if (!providerOpen.includes(taskId) || !providerOpen.includes(title)) fail(`The provider opened a different task. Dialog: ${providerOpen.replace(/\s+/g, ' ').slice(0, 220)}`);
    if (!/High/i.test(priorityChosen || providerOpen) || !/NXL-2026-0327/.test(providerOpen)) fail('The provider task does not show the same priority and linked case.');

    const titleBox = providerDialog.getByRole('textbox', { name: /Type task title|^Title/i }).first();
    if (await titleBox.isVisible().catch(() => false) && await titleBox.isEditable().catch(() => false)) fail('The provider can edit the title.');
    const priority = providerDialog.getByLabel(/Priority/i);
    if (await priority.count() && await priority.first().isEnabled().catch(() => false) && await priority.first().evaluate((el) => el.tagName === 'SELECT' || el.getAttribute('role') === 'combobox').catch(() => false)) {
      if (await priority.first().isEditable().catch(() => false)) fail('The provider can edit the priority.');
    }
    const assignGroup = providerDialog.getByRole('radiogroup', { name: /Assign to/i });
    const radios = assignGroup.getByRole('radio');
    const radioCount = await radios.count();
    if (!radioCount) fail('The assignee control was not on the provider task.');
    for (let i = 0; i < radioCount; i += 1) {
      if (await radios.nth(i).isEnabled()) fail('The provider can edit the assignee.');
    }

    await providerDialog.locator('select').filter({ hasText: /In Progress/ }).first().selectOption('started');
    await provider.getByRole('textbox', { name: /Add a comment/i }).fill(comment);
    await provider.getByRole('button', { name: 'Post comment' }).click();
    await provider.getByRole('button', { name: 'Update status' }).click();
    await provider.getByText(comment).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);

    providerDialog = await refreshAndOpen(provider, 'provider', taskId);
    const providerAfter = await readDialog(providerDialog);
    const providerStatus = await selectedOption(providerDialog, /In Progress|Open|Completed/);
    if (!providerAfter.includes(comment)) fail('After refresh, the comment is not inside the provider task.');
    if (!/In Progress/i.test(providerStatus)) fail('After refresh, In Progress is not inside the provider task.');

    const staffDialog = await refreshAndOpen(staff, 'staff', taskId);
    const staffAfter = await readDialog(staffDialog);
    const staffStatus = await selectedOption(staffDialog, /In Progress|Open|Completed/);
    if (!/In Progress/i.test(`${staffStatus}\n${staffAfter}`) && !/Status changed to started/i.test(staffAfter)) fail('After refresh, Staff does not show In Progress inside the task.');
    if (!staffAfter.includes(comment)) fail('After refresh, Staff does not show the provider comment inside the task.');
  } finally {
    await providerSession?.context.close();
    await staffSession.context.close();
  }
});
