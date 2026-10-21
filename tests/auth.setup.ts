// Runs before every P1 check (the `setup` project). Signs each saved role in once and writes its
// storage state to .auth/, which specs reuse through `openSession` or `test.use({ storageState })`.

import { test as setup } from '@playwright/test';
import { authFile, SAVED_SESSIONS, SavedRole, signIn } from './support/session';

for (const [role, portal] of Object.entries(SAVED_SESSIONS) as Array<[SavedRole, (typeof SAVED_SESSIONS)[SavedRole]]>) {
  setup(`sign in ${role}`, async ({ page }) => {
    await signIn(page, portal, role);
    await page.context().storageState({ path: authFile(role) });
  });
}
