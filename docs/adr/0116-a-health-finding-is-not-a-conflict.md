# ADR-0116 — A health finding is not a conflict, and a report never omits a check

- **Status:** Accepted (M0–M5 landed 2026-08-28, gate pass folded; M6 — the metric-12 what-if
  route — follows as its own slice per the plan's sequencing table)
- **Date:** 2026-08-28
- **Spec:** [`docs/specs/schedule-health-check/`](../specs/schedule-health-check/)

## Context

A construction planner is routinely required to prove a programme is well built before a client
accepts it, and the DCMA 14-Point Assessment is the public de-facto standard for that proof.
SchedulePoint could say _this recalculation_ hit a problem — three engine-owned `CONFLICT_FLAGS` —
and could say nothing about _how the plan is built_: the workaround was to export to XER and open
the assessment in the tool this product exists to replace, which is verbatim the argument ADR-0059
used for the Gantt. The feature is not a new idea in this register: **ADR-0035 §16 names it and
defers it** as "a later, non-blocking add". Every input it needs has since landed; nothing consumed
them.

The vocabulary question is the sharp one. The product's only existing "something is wrong" set,
`CONFLICT_FLAGS`, was deliberately shrunk from five members to three by ADR-0094 — including
removing **negative float**, which is DCMA metric 7. That removal was right for a navigation cycle
(one root cause counted N times down a chain is unactionable) and wrong for an assessment (an
assessor wants the count). So the same fact legitimately lives in one vocabulary and not the other —
which is exactly the situation that produces two disagreeing numbers on one screen if nobody writes
the boundary down.

## Decisions

- **D1 — a pure read-model.** `GET …/schedule/health-check` computes all fourteen metrics from
  persisted rows, gated `schedule:read`. **The CPM engine is not imported and not modified; the
  ADR-0034 recalculation parity gate is untouched by construction**, pinned by an import-ban
  structural test verified red (`health-engine-free.structural.spec.ts`). The read takes **no plan
  lock, no advisory lock, no transaction and no pen** — an advantage over both benchmark endpoints,
  not a resemblance: it can neither block a recalculation nor be blocked by one, and the only
  concurrency question it raises is staleness, which `computedAt` puts on the face of the report.
- **D2 — a health finding and a conflict are different statements**, and the vocabularies are
  provably disjoint: `HealthMetricId ∩ ConflictKey = ∅` (G1), no import in either direction (G2),
  both verified red. The panel's footer says the distinction in a planner's words, because metric 7
  can read _Fail — negative float_ while `Next conflict` honestly reports nothing to review.
- **D3 — a metric that cannot be computed is reported as not assessed, never omitted, never
  faked.** The response is total over a closed 14-member union, in ordinal order, and
  "cannot assess" is a 200 with a typed reason — never a 4xx, which would make the whole report
  unavailable because one row could not be answered. The per-metric shape is a **documented
  discriminator on `verdict`** (a `NOT_ASSESSABLE` row has `measured: null`, `detail: null`, empty
  offenders), asserted cell by cell by the totality suite rather than left to fourteen evaluators
  to answer differently. Reasons print as sentences; a code reaching paper is a tested-for defect.
- **D4 — a threshold is stated in exactly one place.** `THRESHOLDS` is a compiler-total record in
  the API; every threshold travels in the payload; the web feature contains **no threshold literal**
  (G3, comment-stripped scan plus a positive case). The offender cap rides the payload for the same
  reason (`offenderCap`), so "showing 50 of 412" is never a client's own number.
- **D5 — the report does not vary by role.** Metric 10 is narrowed to resource-assignment existence
  precisely so `cost:read` cannot change what a handed-over document says, the narrowing is named in
  the payload (`detail.narrowing`), and **G4** — a structural gate rejecting any cost/budget/rate/
  expense-shaped field name in the health sources and DTO, verified red — turns the invariance from
  a property of the current code into one a later milestone cannot remove by accident.
- **D6 — no schema change.** All fourteen metrics were enumerated against `schema.prisma` at M0 and
  eleven compute from existing columns today; 11/13/14 additionally need an active baseline (an
  existing capability); 12 is structurally uncomputable from persisted state. The enumeration is
  the record (`m0-measurement.md`), and after CQ-2 = (a) the `database-architect` trigger never
  fires in this epic — in the honest form: there is nothing to design, not "a change was judged too
  small".
- **D7 — metric 12 is computed by a read-only what-if pass on a separate route** (CQ-1 = (b),
  product owner, 2026-08-27), **and that route does not inherit D1's sentence.** "The engine is not
  imported" is a claim about the module graph and stays true of the report; the M6 route's claim is
  the different, weaker one — it **computes read-only and persists nothing**, proved by reading
  every engine-owned column back and asserting equality, with its own measured throttle (M6-T0,
  mandatory first). Until M6 lands the metric reports `NOT_ASSESSABLE / REQUIRES_WHAT_IF_ANALYSIS`
  with the check explained, so the report's shape never changes and M6 upgrades one row's content.
- **D8 — no `VITE_` flag** (ADR-0088 D1: a `VITE_` constant is inlined at build time and has never
  been an operator rollback). The rollback contract is the commit boundary, written down per slice
  in the plan's sequencing table.
- **D9 — the report is a live read, not a snapshot** (CQ-2 = (a)). `computedAt` is displayed rather
  than stored — weaker in one way (nobody can prove afterwards what a report said) and stronger in
  another (it can never be silently stale). A snapshot is named as a possible future epic together
  with the four things it forces (`database-architect`, an audit action under ADR-0073 Test 1, a
  retention decision, a restore question), so the cost is met before that work starts. The dormant
  milestone was **removed from the plan, not deferred** — a milestone left in with "only if…"
  attached is how a stale gate reads as live work (`scripts/frontend-only.json` records that twice).
- **D10 — the docked panel joins the workspace's one-dock-at-a-time rule as a SET** (`right-docks.ts`):
  each member's closer keyed by name and "close the others" derived from the member list, because a
  two-participant rule is two statements, a third participant needs six, and the way that fails is
  that five get written. Three set-derived assertions cannot be five-sixths written.

## What this epic got wrong on the way

Recorded because the corrections are the useful part, and an epic that records only the ones found
late is telling half the story.

- **The spec's own Gantt-reveal claim was wrong, and a reviewer found it, not its author.** The
  first draft cited `requestSelectActivity` + `onSelectionChange` as "the seam already used by
  float paths" for jump-to-offender. That moves the **selection only**: the Gantt's scroll and its
  collapsed-ancestor expansion hang off `bringIntoViewActivityId`, supplied under two conditions a
  health activation meets neither of. The panel would have moved the selection and revealed nothing,
  exactly where the offender's parent was collapsed. Fixed as a third reveal source with its
  precedence written beside the existing two (`healthRevealId`), and the journey asserts the scroll
  **and** the expand — jsdom has no virtualizer, so only a browser can see either half fail.
- **Two brief claims failed verification before a line of code** (spec §3.6): the conflict-remedy
  path cited a file that does not exist at that path, and `CONFLICT_FLAGS` had held five members,
  not three, until ADR-0094 — a fact that turned out to shape D2 rather than merely correct it.
- **G3 caught its own docblock on its first run** — a `"≥ 0.95"` example inside a comment. The
  fourth scan-matching-prose gate in this repository (ADR-0106 M4 records the third); fixed as its
  siblings fixed themselves, by stripping comments before scanning, and the prose kept.
- **A stale seam comment was corrected rather than stepped over** (M3-T4): the float-paths
  view-agnostic gate said the shared seam was `ctx.goToActivity`; a repository-wide grep returned
  that comment and nothing else. The seam was real, the name was not (the ADR-0071 rule).
- **The seed catalogue's resting state contradicted the working assumption** (M0-T1 F-M0-1): the
  fixture and scale tiers land **uncalculated** — `PLAN_NOT_SCHEDULED` is the catalogue's own
  resting state, not an edge case. And seeding the fixture twice into one plan leaves it unable to
  recalculate at all, surfacing the engine's working-time horizon guard as an untyped 500 — two
  defects outside this epic's scope, filed as `docs/TECH_DEBT.md` #205 rather than absorbed.
- **The shared e2e database destroyed the measurement environment** — the API e2e suite's own
  `resetDatabase()` wiped the seeded catalogue mid-epic, so the 2,000-activity numbers had to be
  re-seeded after the suite ran. Recorded in `m0-measurement.md` so the next measurement sequences
  seeding after e2e runs rather than rediscovering this.

## The M5 gate pass (2026-08-28)

Six specialists over the epic's combined diff. Backend-performance passed (it measured the shipped
compute at 5.7–5.9 ms at 2,000 activities and its one suggestion — the two day-factor lookups
sharing a round trip — was folded); the other five blocked, on findings that share this register's
recurring shapes:

- **The epic's own gate did not deliver what its docblock claimed** (the ADR-0110 D5 shape, on a
  gate rather than a feature). G4's key pattern was anchored to line start — how Prettier formats a
  MULTI-line object literal and not a single-line one — so
  `{ narrowing: RESOURCES_NARROWING, cost: 0 }` (Prettier-clean, 95 chars) passed it, as did a
  banned-named shorthand property, which has no `:` at all. The security review proved both by
  running the mutations live. The scan is whole-file now, both bypasses are pinned as fixtures, the
  fix was verified red against the real mutation, and the scan set gained the `getHealthCheck`
  method slices of the service and controller — method-scoped, because the service legitimately
  hosts the ADR-0042 cost read model whole-file, which the first widened draft flagged in 26 places.
- **The printout was more honest than the screen.** The panel never stated `computedAt`,
  `schedulingMode` or the active baseline — the spec's own D9 says provenance is on the face of
  _every_ rendering, and the print document obeyed while the live panel did not. A planner reading
  a stale report on screen had no way to tell.
- **One correct pattern applied to a control and not its neighbour, three more times** (the
  ADR-0064 §7 shape): `pass` used the audited `-text` ink token while `fail` used the fill token
  the contrast gate never checks as text; the error state was a bespoke `role="status"` div while
  the sibling Float-paths dock renders the same failure through `NoticeStrip` as an alert; and the
  live announcement dropped the informational count that the visible summary always states —
  handing a screen-reader user a different report.
- **A role-shut remedy rendered as silence**, misapplying the ADR-0082 rule the code itself cited:
  omission is for a remedy that does not exist; a route shut by ROLE is explained. A Viewer now
  reads "ask a Planner" instead of nothing, in both docks — fixing only one would have created the
  drift the finding was about.
- **The only axe scan certified the one state a real plan never shows** — an all-PASS fixture
  exercising the non-interactive branch, no disclosure, no offender list, no remedy button, while
  the journey ran no scan at all. The unit suite now scans mixed verdicts with a row expanded plus
  the error state, and the journey scans the real panel open (whole-page, no `.include()` — the
  ADR-0099 M5 stale-selector lesson applied in advance).
- **Two of the epic's own citations were wrong**: the DTO's `count` description asserted the
  inverse of what `measuredPercent()` does, and the 429 text cited a measurement whose Scale-2000
  rows were still `TBD` — an ADR-0076 Class 3 claim inside the OpenAPI contract. The rows are now
  filled (the loaders measured sub-1 ms each at 2,000 activities against a synthetic SQL-built
  plan, with the security review's independent re-derivation agreeing), and the DTO's three closed
  unions are derived from the `@repo/types` tuples rather than hand-copied.

One more environment fact is recorded because the next measurement will meet it: the 2,000-activity
REST seed was lost twice to environment recycles mid-run, so the Scale-2000 loader numbers were
measured against a synthetic plan built directly in SQL — legitimate for THIS measurement and only
this one, because an `EXPLAIN` of the loader queries reads rows and never exercises the write path
(ADR-0066's never-read-persisted-rows rule governs the engine-input differential, not an
`EXPLAIN`). Five suggestions were deferred with reasons as `docs/TECH_DEBT.md` #206 rather than
dropped.

## Consequences

Positive: a client-grade assessment without leaving the product; a second honest use of the seeded
catalogue as an oracle (the playbook now names which plan proves which metric and what wrong looks
like); no schema change, so the epic carries no migration risk in any environment; and the printed
report is the first deliverable in the product built from the same row derivation the screen uses,
so the two cannot disagree.

Negative, stated rather than glossed: fourteen evaluators are fourteen places a definition can
drift from DCMA's — mitigated by a per-metric unit suite and the catalogue-backed API e2e; the
report is only as good as the last recalculation — mitigated by `computedAt` on its face and
`PLAN_NOT_SCHEDULED` rows rather than vacuous passes; and once M6 lands the estate holds **two
routes with two different parity arguments**, a standing invitation to copy the stronger sentence
onto the weaker route — mitigated by D7 stating both side by side and by M6's non-mutation proof
being a test rather than a claim.

Follow-ups, deliberately not promised here: threshold configurability (fixed to DCMA defaults in
v1), guest-share exposure (excluded by construction — `GuestPrincipal` cannot satisfy
`schedule:read`), redundant-logic detection, and the D9 snapshot epic.

**The CPM engine is not imported by anything M0–M4 shipped, and no migration runs**, so the
ADR-0034 recalculation parity gate is untouched by construction.
