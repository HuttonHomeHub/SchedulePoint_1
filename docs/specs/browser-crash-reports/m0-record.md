# M0 record: the catch path, the journey's crash trigger, the throw-site count

Plan: [`implementation-plan.md`](implementation-plan.md) M0-T1. Spec: [`spec.md`](spec.md).
Measured at base `df033e84` against `@tanstack/react-router@1.170.46`. No product code changed.

## 1. What the test proves

`apps/web/src/app/route-catch.test.tsx` builds a real router with `defaultErrorComponent:
RouteErrorScreen` and a `defaultOnCatch` spy, inside `AppErrorBoundary` exactly as
`app/providers.tsx` nests them:

| Case                                                   | Observed                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| A route component throws while rendering               | `RouteErrorScreen` ("Try again") shows; `defaultOnCatch` called once with the error; the app boundary is not reached |
| A loader throws an `ApiFetchError`                     | `defaultOnCatch` is also called once, so the reporter must skip `ApiFetchError` itself                               |
| A component outside every route match throws           | `AppErrorBoundary` ("Reload") shows; `defaultOnCatch` is not called                                                  |
| The calendars screen is fed `{ data: [null] }` (below) | `defaultOnCatch` receives a `TypeError`, not an `ApiFetchError`; the app boundary is not reached                     |

The router internals this rests on (`Match.js:33-34`, `:52-64`, `:56-59`) are registered in
`scripts/dependency-claims.json`, so `pnpm check:claims` fails on the bump that moves them.

## 2. The journey's crash trigger (decided by reading)

**Corrupt the calendar list response.** In the M3 journey, before navigating to
`/orgs/<slug>/calendars`, route `**/api/v1/organizations/*/calendars*` to fulfil with status 200 and
body `{"data":[null],"meta":{"hasMore":false,"nextCursor":null}}`.

Why it works, each step read in the code:

1. `calendarsQueryOptions` fetches through `apiFetchAllPages` (`features/calendars/api/use-calendars.ts:159`).
2. `apiFetchAllPages` does `rows.push(...envelope.data)` with no row check (`lib/api/client.ts:131`), so
   `[null]` becomes the query's data. A 200 never raises an `ApiFetchError`.
3. `CalendarsTable` calls `useCalendarProjectNames(orgSlug, calendars.data)`, which reads
   `calendar.scope` on each row during render (`features/calendars/api/use-calendar-project-names.ts:34`).
   That is a `TypeError` thrown in render, inside the `/orgs/$orgSlug/calendars` route match.

Why this screen rather than the obvious one: the **clients** list is also read by the navigator rail
(`features/navigator/hooks/use-hierarchy-tree.ts:91`, same query key), so corrupting it would crash the
`_authed` shell and report the layout route, not the screen. Nothing else reads the org calendar list
on that route (`grep` for `calendarsQueryOptions`/`useCalendars(` finds only `CalendarsTable` and the
resources screen's picker, which is a different route). The reported pattern is therefore
`/orgs/$orgSlug/calendars`, which is what M3's assertion on the staff panel row should expect.

The unit test exercises the same path with the real `apiFetchAllPages` and a stubbed `fetch`.
It proves the throw and which boundary catches it, not Playwright's interception, which M3 owns.

**Fallback**, if the response shape ever gains a row check: any list whose row is dereferenced in a
cell, on a route no other component shares the query with. The journey fails loudly rather than
passing, because it asserts "Something went wrong" and the staff row.

## 3. Interpolated throw-site recount (spec §3 Security)

Pattern: `throw new <X>Error(\`…${…}\`)`in`apps/web/src`excluding`_.test._`and`src/test/`(test helpers, never shipped). **8 sites at`df033e84`**, matching the spec's count at `5e9435e5`:
`Toolbar.tsx:213`, `toolbar-promotion.tsx:312`, `toolbar-registry.ts:489,492,672`,
`levelling-application.ts:99`, `scenarios.ts:167`, `run-loading-probe.ts:365`. The regex is
single-line, so a template literal split across lines would not be counted.
