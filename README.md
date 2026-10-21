# P1 production blockers

Playwright checks that verify Nexletta P1 tickets against the live staff, veteran and provider portals.
Each spec in `tests/p1` is one ticket. The number at the start of the file name is the run order, and the
Playwright name starts with the ticket id, so you can run one check by that id.

This repo does not include the post-deployment smoke suite.

## Checks

| Order | File                                               | Playwright name                                                        | Run only this check                    |
| ----- | -------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| 01    | `tests/p1/01-nx-030-account-activation.spec.ts`    | NX-030 Separate account activation from invitation and identity checks | `npx playwright test -g "NX-030"`      |
| 02    | `tests/p1/02-nx-039-disputed-payments.spec.ts`     | NX-039 Communicate disputed payments and allow correction              | `npx playwright test -g "NX-039"`      |
| 03    | `tests/p1/03-nx-049-restrict-task-content.spec.ts` | NX-049 Restrict changes to other users task content                    | `npx playwright test -g "NX-049"`      |
| 04    | `tests/p1/04-state-match-eligibility.spec.ts`      | STATE-MATCH veteran, provider, and clinic states must all match        | `npx playwright test -g "STATE-MATCH"` |
| 05    | `tests/p1/05-zone-portal-timezones.spec.ts`        | ZONE-PORTAL veteran and provider times follow their own timezone       | `npx playwright test -g "ZONE-PORTAL"` |

## Run

```bash
npm install
npx playwright install chromium
cp .env.example .env        # Windows cmd: copy .env.example .env — then fill in the accounts
npm test
```

- `npm run test:headed` to watch the browser.
- `npm run report` to open the HTML report of the last run (`reports/html`).
- Every run first signs ADMIN, VETERAN and PROVIDER in once (`tests/auth.setup.ts`) and saves the sessions to
  `.auth/`. Running a single check with `-g` still does this.

Passwords stay in `.env`, and sessions in `.auth/`. Neither is committed.

## Layout

```
tests/
  auth.setup.ts   saved sign-ins for ADMIN, VETERAN, PROVIDER
  p1/             one spec per P1 ticket, NN-<id>-<slug>.spec.ts
  support/        shared helpers, one module per area (env, errors, session, report, ui, tasks, states, timezones)
  support/test-data.ts   fixed records the checks rely on (names, ids)
  fixtures/       files the checks upload
```

## Failures

Every failure message starts with who has to act:

- `[application]` the product did the wrong thing. This is a P1 finding.
- `[test-data]` a record the check needs is missing or in the wrong state. Fix the data.
- `[automation]` the script could not drive the page or a `.env` key is missing. Fix the script or `.env`.

Annotations on each test in the HTML report give the area, the expected behaviour, numbered repro steps, and
what was actually observed.

## Adding a check

The process and a spec template are in `.cursor/rules/50-add-p1-check.mdc`, and Cursor applies the rest of
`.cursor/rules/` automatically. In short: next free number, ticket id first in the test name, records in
`TEST_DATA`, reusable steps in `tests/support/`, restore what you change, `npm run check`, add a row above.

Before committing, run:

```bash
npm run check   # typecheck + Prettier
```
