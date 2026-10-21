/**
 * ZONE-PORTAL veteran and provider times follow their own timezone
 *
 * Order:    05
 * Run only: npx playwright test -g "ZONE-PORTAL"
 * Signs in: VETERAN and PROVIDER (saved sessions)
 * Leaves:   nothing. Read-only.
 */

import { test } from '@playwright/test';
import { failApp, failTestData } from '../support/errors';
import { describeCheck, recordActual } from '../support/report';
import { authFile, gotoPortal, openSession } from '../support/session';
import { profileTimezone, timezoneSelect, visitTimes, zoneOf } from '../support/timezones';
import { checkedLabel } from '../support/ui';

test.use({ storageState: authFile('VETERAN') });

test('ZONE-PORTAL veteran and provider times follow their own timezone', async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  describeCheck(testInfo, {
    area: 'Veteran / provider appointments',
    expected:
      'Veteran appointment times use the timezone on the veteran profile. Provider appointment times use the timezone selected on the provider appointment module.',
    steps: [
      'Open the veteran profile and read the timezone.',
      'Open veteran Appointments and read the visit times.',
      'Open provider Appointments, read the timezone control, and read the visit times.',
    ],
  });

  const profile = await profileTimezone(page);
  const veteranZone = /Practice default/i.test(profile) ? null : zoneOf(profile);
  await gotoPortal(page, 'veteran', '/veteran/appointments');
  const veteranTimes = await visitTimes(page);
  if (!veteranTimes.length) failTestData('The veteran calendar has no visit time to compare with the profile timezone.');
  if (veteranZone) {
    const missed = veteranTimes.filter((item) => !veteranZone.mark.test(item));
    if (missed.length) {
      failApp(
        `Veteran profile timezone is ${veteranZone.label}, but a visit time is not shown in that zone. Sample: ${missed[0].slice(0, 220)}`,
      );
    }
  }

  const providerSession = await openSession(browser, 'PROVIDER');
  const provider = providerSession.page;
  try {
    await gotoPortal(provider, 'provider', '/provider/appointments');
    const selected = zoneOf(await checkedLabel(await timezoneSelect(provider)));
    const providerTimes = await visitTimes(provider);
    if (!providerTimes.length) failTestData('The provider calendar has no visit time to compare with its timezone control.');
    const missed = providerTimes.filter((item) => !selected.mark.test(item));
    if (missed.length) {
      failApp(
        `The provider appointment module is set to ${selected.label}, but a visit time is not shown in that zone. Sample: ${missed[0].slice(0, 220)}`,
      );
    }

    const veteranNote = veteranZone
      ? `Veteran profile is ${veteranZone.label} and the visit times use that zone.`
      : `Veteran profile is "${profile}", so the visit times were only confirmed to be present.`;
    recordActual(testInfo, `${veteranNote} Provider appointment module is ${selected.label} and the visit times use that zone.`);
  } finally {
    await providerSession.context.close();
  }
});
