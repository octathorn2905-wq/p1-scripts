// Order 04
// Playwright name: STATE-MATCH veteran, provider, and clinic states must all match
// Run this test only: npx playwright test -g "STATE-MATCH"

import { TestInfo, test } from '@playwright/test';
import { expectArea, finish } from './support';
import { adminState, app, codeOf, eligibilityText, OTHER_STATE, readTrio, requirePanel, SAME_STATE, writeClinicState, writeTrio, writeUserState } from './state-shared';

test.use({ storageState: adminState });

test('STATE-MATCH veteran, provider, and clinic states must all match', async ({ page }, testInfo: TestInfo) => {
    testInfo.setTimeout(420_000);
    expectArea(testInfo, {
      area: 'Staff / scheduling',
      acceptance: 'Eligible only when the veteran address state, the provider license state, and the clinic location state are the same. Any one difference says Not eligible. Nothing is booked.',
      steps: [
        'In Admin Users, set muskan aaa and Muskan prov to the same state, and set P1 LOC to that state under Locations.',
        'Open Appointments, Add, Book appointment, and choose Muskan prov, P1 LOC, and muskan aaa.',
        'Change only the veteran state and read Not eligible.',
        'Change only the clinic state and read Not eligible.',
        'Change only the provider license state and read Not eligible.',
        'Put the three original states back.',
      ],
    });

    const original = await readTrio(page);
    let restored = false;
    try {
      await writeTrio(page, { veteran: SAME_STATE, provider: SAME_STATE, clinic: SAME_STATE });
      const sameCode = codeOf(SAME_STATE);
      const same = await eligibilityText(page);
      requirePanel(same, { veteran: sameCode, clinic: sameCode, provider: sameCode }, true, `All three states are ${sameCode}.`);

      await writeUserState(page, VETERAN_QUERY, 'address', OTHER_STATE);
      const veteranDiff = await eligibilityText(page);
      requirePanel(
        veteranDiff,
        { veteran: codeOf(OTHER_STATE), clinic: sameCode, provider: sameCode },
        false,
        `Veteran is ${codeOf(OTHER_STATE)} while clinic and provider stay ${sameCode}.`,
      );

      await writeUserState(page, VETERAN_QUERY, 'address', SAME_STATE);
      await writeClinicState(page, OTHER_STATE);
      const clinicDiff = await eligibilityText(page);
      requirePanel(
        clinicDiff,
        { veteran: sameCode, clinic: codeOf(OTHER_STATE), provider: sameCode },
        false,
        `Clinic is ${codeOf(OTHER_STATE)} while veteran and provider stay ${sameCode}.`,
      );

      await writeClinicState(page, SAME_STATE);
      await writeUserState(page, PROVIDER_EMAIL, 'license', OTHER_STATE);
      const providerDiff = await eligibilityText(page);
      requirePanel(
        providerDiff,
        { veteran: sameCode, clinic: sameCode, provider: codeOf(OTHER_STATE) },
        false,
        `Provider is ${codeOf(OTHER_STATE)} while veteran and clinic stay ${sameCode}.`,
      );

      await writeTrio(page, original);
      restored = true;
      const after = await readTrio(page);
      if (after.veteran !== original.veteran || after.provider !== original.provider || after.clinic !== original.clinic) {
        app(`Original states did not stick. Veteran ${after.veteran}, provider ${after.provider}, clinic ${after.clinic}. Expected ${original.veteran}, ${original.provider}, ${original.clinic}.`);
      }
      return finish(
        testInfo,
        `All three on ${sameCode} is Eligible. Veteran ${codeOf(OTHER_STATE)}, clinic ${codeOf(OTHER_STATE)}, and provider ${codeOf(OTHER_STATE)} are each Not eligible on their own. States were put back to veteran ${original.veteran}, provider ${original.provider}, clinic ${original.clinic}. Nothing was booked.`,
      );
    } finally {
      if (!restored) {
        await writeTrio(page, original).catch(() => undefined);
      }
    }
});

