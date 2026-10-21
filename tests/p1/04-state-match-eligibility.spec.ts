/**
 * STATE-MATCH veteran, provider, and clinic states must all match
 *
 * Order:    04
 * Run only: npx playwright test -g "STATE-MATCH"
 * Signs in: ADMIN (saved session)
 * Leaves:   nothing. The veteran, provider and clinic states are read first and restored in `finally`. Nothing is booked.
 */

import { test } from '@playwright/test';
import { failApp } from '../support/errors';
import { describeCheck, recordActual } from '../support/report';
import { authFile } from '../support/session';
import {
  codeOf,
  eligibilityText,
  readTrio,
  requirePanel,
  writeClinicState,
  writeProviderState,
  writeTrio,
  writeVeteranState,
} from '../support/states';
import { TEST_DATA } from '../support/test-data';

test.use({ storageState: authFile('ADMIN') });

test('STATE-MATCH veteran, provider, and clinic states must all match', async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const { clinic, states } = TEST_DATA;
  const veteran = TEST_DATA.veteran.name;
  const provider = TEST_DATA.provider.name;
  describeCheck(testInfo, {
    area: 'Staff / scheduling',
    expected:
      'Eligible only when the veteran address state, the provider license state, and the clinic location state are the same. Any one difference says Not eligible. Nothing is booked.',
    steps: [
      `In Admin Users, set ${veteran} and ${provider} to the same state, and set ${clinic} to that state under Locations.`,
      `Open Appointments, Add, Book appointment, and choose ${provider}, ${clinic}, and ${veteran}.`,
      'Change only the veteran state and read Not eligible.',
      'Change only the clinic state and read Not eligible.',
      'Change only the provider license state and read Not eligible.',
      'Put the three original states back.',
    ],
  });

  const same = codeOf(states.same);
  const other = codeOf(states.other);
  const original = await readTrio(page);
  let restored = false;
  try {
    await writeTrio(page, { veteran: states.same, provider: states.same, clinic: states.same });
    requirePanel(await eligibilityText(page), { veteran: same, clinic: same, provider: same }, true, `All three states are ${same}.`);

    await writeVeteranState(page, states.other);
    requirePanel(
      await eligibilityText(page),
      { veteran: other, clinic: same, provider: same },
      false,
      `Veteran is ${other} while clinic and provider stay ${same}.`,
    );

    await writeVeteranState(page, states.same);
    await writeClinicState(page, states.other);
    requirePanel(
      await eligibilityText(page),
      { veteran: same, clinic: other, provider: same },
      false,
      `Clinic is ${other} while veteran and provider stay ${same}.`,
    );

    await writeClinicState(page, states.same);
    await writeProviderState(page, states.other);
    requirePanel(
      await eligibilityText(page),
      { veteran: same, clinic: same, provider: other },
      false,
      `Provider is ${other} while veteran and clinic stay ${same}.`,
    );

    await writeTrio(page, original);
    restored = true;
    const after = await readTrio(page);
    if (after.veteran !== original.veteran || after.provider !== original.provider || after.clinic !== original.clinic) {
      failApp(
        `Original states did not stick. Veteran ${after.veteran}, provider ${after.provider}, clinic ${after.clinic}. Expected ${original.veteran}, ${original.provider}, ${original.clinic}.`,
      );
    }

    recordActual(
      testInfo,
      `All three on ${same} is Eligible. Veteran ${other}, clinic ${other}, and provider ${other} are each Not eligible on their own. States were put back to veteran ${original.veteran}, provider ${original.provider}, clinic ${original.clinic}. Nothing was booked.`,
    );
  } finally {
    if (!restored) await writeTrio(page, original).catch(() => undefined);
  }
});
