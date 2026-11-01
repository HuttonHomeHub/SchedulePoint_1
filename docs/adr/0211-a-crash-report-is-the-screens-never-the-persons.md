# ADR-0211: A crash report is the screen's, never the person's

- **Status:** Proposed. Becomes Accepted at the epic's last milestone (M3), when staff can read what is
  collected; until then the sink exists and nobody can read it. M1 (the table, the sink, the sweep) has
  landed on its branch; M2 (the reporter in the browser) and M3 (the staff panel) have not.
- **Date:** 2026-11-01
- **Deciders:** Product owner (spec questions Q1 to Q4, 2026-11-01: signed-in people only; "Needs attention"
  for 7 days; a reference line only when the report arrived; only errors that break the screen).
- **Spec:** [`docs/specs/browser-crash-reports/spec.md`](../specs/browser-crash-reports/spec.md) §4.9 (this
  ADR's outline) and its [implementation plan](../specs/browser-crash-reports/implementation-plan.md).
  Closes `docs/TECH_DEBT.md` #551.

## Context

When a screen crashes, the planner sees "Something went wrong" and the error goes to their own browser
console. A crash every planner on the deployed host meets is seen by nobody who can fix it, and the product
is in real use (CLAUDE.md §17).

Three facts shaped the design. **The boundary the TODO named almost never fires.** `createRouter` sets
`defaultErrorComponent`, and TanStack Router wraps every route match in its own `CatchBoundary`
(`@tanstack/react-router` `Match.js:33,52-64`), so a render error in a screen shows `RouteErrorScreen` and
never reaches `AppErrorBoundary`, which sits outside the router. A reporter in `componentDidCatch` alone
would leave nearly every real crash unreported while looking like the row was closed (spec §0). **ADR-0013
(OpenTelemetry) has no implementation** and no dependency installed (CLAUDE.md §17). And **ADR-0086 D6**
says staff must not read customer content, while an error message is exactly the channel through which plan
text could reach a staff screen.

## Decision

- **D1. The browser reports its own crashes to a first-party sink.** `POST /api/v1/crash-reports`, called
  from the router's `defaultOnCatch` (the main site) and `AppErrorBoundary.componentDidCatch` (the last
  resort). This narrows ADR-0013 for the browser and does not wait for it.
- **D2. The sink is authenticated.** The CSP sink is `@Public()` because a browser sends a violation report
  without credentials; our own code sends this one with the session cookie, so that reason does not apply.
  A session keeps the `@Public()` list short (ADR-0051), makes an anonymous flood need an account first, and
  stores nothing for people who never signed in. **What that leaves unseen**: a crash on a sign-in or
  share-link screen (spec Q1). An anonymous variant is additive later, on the CSP precedent.
- **D3. What is stored, and what never is.** One row per distinct crash: boundary, error name, a cleaned
  message, the route **pattern**, the web release, the browser family and major version, a cleaned stack and
  component stack, a count and two timestamps. **Never** a user, organisation, plan, project, client or
  activity id, an email, an address, a full user agent, a full or resolved URL, a query string or a
  correlation id (that id joins the row to a log line carrying the principal, which would make an anonymous
  row attributable). The server cleans every text value before it is written, whatever the browser did
  (a URL reduced to scheme and host, because a path is where a customer's slug lives; any rooted path,
  host-with-path, token carrying a query and regular-expression literal replaced; emails, UUIDs and digit
  runs of four or more removed in any script; quoted values removed unless they are a bare identifier;
  frames reduced to a same-origin path). **The cleaner is the ADR-0086 D6 guarantee for this table**, and
  `crash-reports.fields.structural.spec.ts` asserts the field list over the model, so a column added later
  fails the build and needs a privacy argument, not only a migration. The row adds no erasure obligation
  under ADR-0085 and is outside the organisation export (ADR-0194).
- **D4. The dedupe key has the release and the browser in it.** `sha256(release, boundary, error name,
message, route pattern, top five frames, browser)` joined on U+001F. A crash that returns after a fix is a
  new row, not a merged count; fragmentation is visible and additive, conflation overstates and cannot be
  undone (the `csp_reports` argument). The stack's tail, the component stack and the browser major are
  last-writer-wins.
- **D5. Three bounds, and their arithmetic.** The browser sends at most 3 reports per page load and one per
  crash per tab; the route is throttled at 10 a minute per address; the table stores at most 1,000 distinct
  crashes, a new fingerprint being dropped (a repeat still counts) in the same statement that writes. Worst
  case 1,000 rows of roughly 6.3 k characters: about 8 MB. The cap is checked inside the upsert, so two new
  fingerprints at 999 can both pass (1,001 rows) and a repeat whose first insert is uncommitted elsewhere is
  dropped; both are accepted.
- **D6. Retention is 30 days after the crash was last reported**, the fourth `RETENTION_TABLES` entry
  (ADR-0087), overridable by the optional `RETENTION_CRASH_REPORTS_DAYS`. Like `csp_reports` it bounds
  staleness, not row age: a crash still happening never expires.
- **D7. No flag** (ADR-0088 D1). The rollback is reverting the commit; the entry point is the staff console
  section in M3.

## Alternatives considered

- **Wait for ADR-0013.** No implementation and no dependency, and browser telemetry would still need a
  backend the operator must run and configure.
- **A hosted service (Sentry or similar).** A new third party receiving customer-adjacent data, a DSN the
  operator must set, a CSP `connect-src` change and a vendor SDK in the bundle.
- **An anonymous endpoint like the CSP sink.** Covers sign-in and share-link screens, at the price of a
  second anonymous writer and a weaker flood bound. Kept as spec Q1's alternative.
- **One row per report.** Unbounded growth from one broken screen, the failure the brief names.
- **Store the raw message and stack.** Breaks ADR-0086 D6 the first time a message carries plan text.
- **Also `window.onerror` and `unhandledrejection`** (spec Q4's alternative). Far noisier, much of it from
  extensions, and it does not break the screen. The reporter takes a `boundary` value so a third source is
  additive.
- **Hook only `AppErrorBoundary`.** Would close the row on paper and leave it open in practice (Context).

## Consequences

- A crash on a signed-in screen becomes a cleaned, deduplicated row staff can act on, without the owner
  checking anything on a server or a device.
- **The cleaner is load-bearing, and its residue is stated.** A third-party library message that embeds a
  user value in a form the rules miss can be stored; the known case is an **unquoted single word**
  (`Cannot find customer Jane`), which no rule can tell from prose. The row cannot be linked to anyone, is
  bounded by the 30-day period and the 1,000-row cap, and is read only by staff.
- **A flood can fill the table, and nothing evicts.** An authenticated user posting distinct fingerprints at
  10 a minute reaches 1,000 rows in under two hours; from then on a genuinely new crash is dropped until old
  rows expire (30 days after they were last reported). Eviction was declined: it would let a flood push out
  the real findings it was meant to be recorded beside. The staff panel (M3) must therefore say when the cap
  is reached, and the sink logs `crash_report.cap_reached`.
- **The route is deliberately `200` for any body that parses**, and `200` does not mean stored: a client
  shows a reference only when it is non-null. Unparseable JSON, `null`, a bare string and a body over 64 KB
  are the body parser's `400` and `413`, answered before authentication.
- **Not done:** symbolication (a developer resolves frames against the release's source map; the bundle
  ships them), `window.onerror`, anonymous and guest coverage, alerts to a webhook, and a chunk-load failure
  after a deploy (not a defect, ADR-0047).
- **Measured, 2026-11-01** (`apps/api/test/measure/crash-reports-upsert.measure.ts`): the upsert takes
  0.2–0.43 ms at 0, 999 and 1,000 rows for a new and an existing hash, and the cap check does the same work
  (shared hit 64) at every size. Repeats made no HOT updates, because `last_seen_at` is indexed, and left
  +1,944 dead tuples over 1,000 repeats; the 1,000-row cap bounds that and autovacuum clears it. Accepted.
- A failed write is visible to the caller (`reference: null`, so the fallback never claims a report was
  sent) and to the operator (`crash_report.persist_failed`, carrying a SQLSTATE and a constraint name and
  never content, `docs/OBSERVABILITY.md`).

## References

- `docs/TECH_DEBT.md` #551; `docs/DATABASE.md` "CrashReport"; `docs/API.md` "Browser crash reports".
- ADR-0013, ADR-0047, ADR-0051, ADR-0085, ADR-0086, ADR-0087, ADR-0088, ADR-0143, ADR-0178, ADR-0194.
