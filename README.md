# P1 production blockers

The full result list is in [P1-REPORT.md](P1-REPORT.md): 46 fixed, 2 not fixed, 2 not fully verified.

Every saved Playwright script lives in `tests/p1`. The number at the start of the file name is the run order. The Playwright name starts with the id, so you can run one test by that id.

This repo does not include the post-deployment smoke suite.

## Tests

| Order | File | Playwright name | Run only this test |
| --- | --- | --- | --- |
| 01 | `tests/p1/01-nx-030-account-activation.spec.ts` | NX-030 Separate account activation from invitation and identity checks | `npx playwright test -g "NX-030"` |
| 02 | `tests/p1/02-nx-039-disputed-payments.spec.ts` | NX-039 Communicate disputed payments and allow correction | `npx playwright test -g "NX-039"` |
| 03 | `tests/p1/03-nx-049-restrict-task-content.spec.ts` | NX-049 Restrict changes to other users task content | `npx playwright test -g "NX-049"` |
| 04 | `tests/p1/04-state-match-eligibility.spec.ts` | STATE-MATCH veteran, provider, and clinic states must all match | `npx playwright test -g "STATE-MATCH"` |
| 05 | `tests/p1/05-zone-portal-timezones.spec.ts` | ZONE-PORTAL veteran and provider times follow their own timezone | `npx playwright test -g "ZONE-PORTAL"` |

Shared sign-in and task helpers are in `tests/p1/shared.ts`. State and timezone helpers are in `tests/p1/state-shared.ts`. Those files are not tests.

## Run

```bash
npm install
npx playwright install chromium
copy .env.example .env
npm test
```

Add `--headed` when you want to watch the browser, or use `npm run test:headed`.

Passwords stay in `.env`. That file is not committed.
