// Order 05
// Playwright name: ZONE-PORTAL veteran and provider times follow their own timezone
// Run this test only: npx playwright test -g "ZONE-PORTAL"

import { TestInfo, test } from '@playwright/test';
import { blocked, expectArea, finish, open } from './support';
import { app, profileTimezone, providerState, timezoneSelect, veteranState, visitTimes, zoneOf } from './state-shared';

test.use({ storageState: veteranState });

test('ZONE-PORTAL veteran and provider times follow their own timezone', async ({ page, browser }, testInfo: TestInfo) => {
    testInfo.setTimeout(240_000);
    expectArea(testInfo, {
      area: 'Veteran / provider appointments',
      acceptance: 'Veteran appointment times use the timezone on the veteran profile. Provider appointment times use the timezone selected on the provider appointment module.',
      steps: [
        'Open the veteran profile and read the timezone.',
        'Open veteran Appointments and read the visit times.',
        'Open provider Appointments, read the timezone control, and read the visit times.',
      ],
    });

    const profile = await profileTimezone(page);
    const concrete = !/Practice default/i.test(profile);
    const veteranZone = concrete ? zoneOf(profile) : null;
    await open(page, 'veteran', '/veteran/appointments');
    const veteranTimes = await visitTimes(page);
    if (!veteranTimes.length) blocked('The veteran calendar has no visit time to compare with the profile timezone.');
    if (veteranZone) {
      const missed = veteranTimes.filter((item) => !veteranZone.mark.test(item));
      if (missed.length) {
        app(`Veteran profile timezone is ${veteranZone.label}, but a visit time is not shown in that zone. Sample: ${missed[0].slice(0, 220)}`);
      }
    }

    const providerContext = await browser.newContext({ storageState: providerState });
    const provider = await providerContext.newPage();
    try {
      await open(provider, 'provider', '/provider/appointments');
      const selected = zoneOf(await (await timezoneSelect(provider)).locator('option:checked').innerText());
      const providerTimes = await visitTimes(provider);
      if (!providerTimes.length) blocked('The provider calendar has no visit time to compare with its timezone control.');
      const missed = providerTimes.filter((item) => !selected.mark.test(item));
      if (missed.length) {
        app(`The provider appointment module is set to ${selected.label}, but a visit time is not shown in that zone. Sample: ${missed[0].slice(0, 220)}`);
      }
      const veteranNote = veteranZone
        ? `Veteran profile is ${veteranZone.label} and the visit times use that zone.`
        : `Veteran profile is "${profile}", so the visit times were only confirmed to be present.`;
      return finish(testInfo, `${veteranNote} Provider appointment module is ${selected.label} and the visit times use that zone.`);
    } finally {
      await providerContext.close();
    }
});
