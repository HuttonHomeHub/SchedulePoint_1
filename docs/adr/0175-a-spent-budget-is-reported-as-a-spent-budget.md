# ADR-0175: A spent budget is reported as a spent budget

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** James Ewbank (product owner — approved 2026-10-03: Q1 a test that met a 429 fails
  even if it otherwise passed; Q2 the eight `100000` limits become measured numbers; Q3 conditional
  on M0), with Claude Code
- **Builds on:** ADR-0081 (a journey is the gate), ADR-0110 (a gate is verified against the defect
  it names), ADR-0164 (a lint warning is a failure), ADR-0088 D1 (no flag)
- **Spec:** [`docs/specs/e2e-throttle-visibility/`](../specs/e2e-throttle-visibility/feature-spec.md);
  `docs/TECH_DEBT.md` #361, with #435 as the live recurrence

## Context

`ThrottlerGuard` refuses more than 100 requests per 60 s from one IP **to one handler**
(`apps/api/src/app.module.ts:100-105`; the bucket key is class, handler and throttler name per
tracker). A journey suite runs every test from one IP against one API process, so a suite that signs
up a fresh user in every test spends one handler's budget repeatedly. When it is spent, nothing says
so: `GET /api/v1/me` answers 429, the session hook yields no user, every screen draws its signed-out
half correctly, and the journey waits out its timeout on a heading the product is right not to draw.
The report names the heading. Every journey config also starts the API with `LOG_LEVEL: 'silent'`,
so the server's own warning is absent as well.

That has now cost four rounds. #360 published "pre-existing" before anyone measured (`/me` peaked at
99 and 106 against 100). Eight configs answered by raising `RATE_LIMIT_LIMIT` to `100000`. #435
widened a wait for a cause it never established, and CI run `37158874019` then failed the same step
again in `e2e-activity-editor`. #361's own figure ("four of 49 configs") was stale: it is 53 configs,
eight of which raise the limit.

M0 measured `e2e-activity-editor` locally on 2026-10-03 against a default-limit API with request
logging on: 844 requests, **zero 429s**, busiest handler `GET /api/v1/me` at 64 in a 60 s window.
That does not confirm the throttler as #435's cause (a local run is faster than CI, which makes it
over-report exposure, so a clean local run is weak evidence). It does show the suite already spends
64 % of a bucket on the handler onboarding drives, and it is the figure D3 sizes ceilings from.

## Decisions

### D1 — Every journey imports `test` from `apps/web/e2e-support/test.ts`, and an unprovoked API 429 fails the test by name

An auto fixture listens for `response` on the test's context and on every context the test opens
with `browser.newContext()` (wrapped for the one test, restored in `finally`), records any 429 under
`/api/`, and at teardown throws a message naming the throttler, the method, the path, the time into
the test, and a count per route. It fails a test that otherwise passed: a retry that got through is a
near-miss, not a pass.

It fails at teardown rather than at the moment of the 429 because a `response` listener cannot abort
a running test body, and a throw inside it is an unhandled runner error rather than a test failure.
The test still waits out its current expectation; the report now leads with the cause, which is what
#361 asked for.

**The enforcement half is lint** (`no-restricted-imports` over `e2e*/`, `e2e-support/` exempt), and
it landed with the migration of the remaining spec files (spec milestone M2), because lint cannot go
red on files that have not moved. Every journey now takes `test` from the fixture, and a spec that
imports `test` from `@playwright/test` fails `pnpm lint`.

**A stated gap.** `APIRequestContext` (`page.request`, the `request` fixture) emits no `response`
event, so a 429 on one of those calls is not seen; they assert their own status. A context opened in
`beforeAll`/`afterAll` is outside the test's scope, and a response still in flight when the body ends
can be missed. In-page `fetch`, contexts from `browser.newContext()`, and pages from
`browser.newPage()` (which calls `this.newContext()`, playwright-core 1.63.0) are covered.

### D2 — A deliberate 429 opts out per test, never per suite

`test.use({ allowRateLimited: true })`, inside the one `describe` that provokes it. A suite that opts
out wholesale has blinded itself to the next real one.

### D3 — A raised `RATE_LIMIT_LIMIT` in a harness cites a census figure and a date, and sits at about 2x it

`E2E_THROTTLE_CENSUS=1` makes each worker print the peak requests per `METHOD path-template` in any
rolling 60 s window, highest first. That is the quantity a bucket limits (it is per handler, not per
suite), so it is what a raise or a suite slimming is sized from. `100000` is withdrawn: it blinds the
guard for that suite for ever. The remedy ladder for a suite above ~80 per handler is: remove
redundant reads; stop re-paying sign-up per test (a worker-scoped account); only then a scoped raise.
The eight existing `100000` configs are re-measured and replaced in the spec's M3.

### D4 — Raising the API log level is a measurement tool, not the mechanism

At `warn` the exception filter logs every 4xx, including the 401 on `/me` before sign-in and the 403,
409 and 423 responses journeys provoke on purpose, so every run is noisy. The output also goes to the
API's stdout rather than onto the failing test, so the reader still correlates by timestamp. It is
the right instrument for a one-off local measurement, which is how M0 used it.

## Consequences

- One fixture module, one self-test journey (`e2e/throttle-visibility.spec.ts`), and one import line
  per spec file. No CI step changes; the lint rule rides `quality`'s `pnpm lint`
  and the fixture rides each suite's existing step.
- Suites that were green by retrying through a 429 may go red when migrated. That is the point; M2
  gives them measured, marked-temporary ceilings so `main` stays releasable.
- Nothing in the product changes: the 100 per 60 s default, `ThrottlerGuard` and Better Auth's
  limiter are untouched.

## Verification (ADR-0110)

The self-test fulfils a 429 on `GET /api/v1/me` in the page context and in a second context. The
twins marked `test.fail()` pass only if the fixture throws, so with the throw removed they go red on
every run. A separate test asserts the message contains `429 RATE_LIMITED`, `ThrottlerGuard` and
`GET /api/v1/me`, and that `allowRateLimited` lets a 429 through without a failure.
