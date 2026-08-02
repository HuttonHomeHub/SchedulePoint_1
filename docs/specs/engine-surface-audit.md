# Engine ↔ planner surface audit — findings register

> **Status:** complete for the scope stated in _Limits_ below. Five findings, none of them yet
> fixed — this is the register the delivery process (§21) wants before any code.
>
> **Method:** ADR-0058's rule — _verify the claim; do not trust the document._ Every row was
> established by reading the engine's input types, the Prisma columns, the DTOs, the repositories and
> the web components, not by reading an ADR that says a thing is done.

## The two questions

- **Outward (engine → planner):** does every input and option the CPM engine accepts have a surface a
  planner can actually reach?
- **Inward (planner → engine):** does everything a planner can set actually reach the engine and
  behave as documented?

The second question produces the worse defects, because a control that is authorable and inert looks
exactly like a control that works.

## Findings

### F1 — `suspendDate` is authorable and inert (inward)

A planner can set a **suspend date** on an in-progress activity. It is validated (a resume before a
suspend is a 422), stored in `activities.suspend_date`, returned on the activity DTO, rendered in the
progress editor, and exported to XER and MSPDI.

**The CPM engine never sees it.** `EngineActivity` has no `suspendDate` field;
`schedule.repository.ts` does not even `select` the column into the recalculation (`resumeDate: true`
is there, `suspendDate` is not); `engine/progress.ts` mentions suspension only in a docblock about
the **resume** instant.

ADR-0035 §4 makes two promises. The first — "remaining work is scheduled from
`max(data date, resume date)`" — **is** implemented, via `resumeDate`. The second — "the suspended
window is excluded from actual duration" — has **no implementation and no consumer anywhere**.

So the field is a record of when work stopped, not a scheduling input, and nothing on screen says so.
A planner who suspends an activity and recalculates gets the same dates they would have got without
it. That is the ADR-0064 "lit but inert" shape, in the progress model rather than the toolbar.

**Two honest resolutions, and they are genuinely different decisions:**

1. Implement §4's second clause — the suspended window stops counting, which changes computed actual
   duration and therefore dates. Real engine work; needs a conformance slice and a parity argument.
2. Declare the field a **record** — amend ADR-0035 §4 to say only `resumeDate` is load-bearing, and
   make the editor say it, so the control stops implying an effect it does not have.

Recommend **(2) first, on its own**: honest immediately, cheap, and it does not block (1) later.
Shipping (1) silently would change dates on every plan that already carries a suspend date.

### F2 — a calendar exception cannot span more than one day (outward, and the most practical)

`calendar_exceptions` stores a **range**: `start_date` and `end_date`, with a Postgres exclusion
constraint over `daterange(start_date, end_date, '[]')` to stop two exceptions overlapping. The
response DTO returns `endDate`. The write path collapses it:

- `create-calendar-exception.dto.ts` accepts `date`, `isWorking`, `label`, `windows` — **no
  `endDate`**.
- `calendar.repository.ts` sets `endDate: exception.date` (line 297) and `endDate: input.date`
  (line 675) — every exception created through the API is exactly one day.
- `endDate` appears **nowhere** in `apps/web/src/features/calendars`.

So a Christmas fortnight, a two-week turnaround or a plant shutdown has to be entered as ten to
fourteen separate one-day exceptions, one at a time — on a schema, a constraint and a read model that
all describe the range the planner actually means. The read DTO returns a range field that can never
differ from its start.

This is the ADR-0067 / ADR-0070 shape a third time: storage and the read model support something no
write path can produce. It is also the one on this list a construction planner will hit most often —
shutdowns are common, and long.

### F3 — remaining duration is day-only, immediately after ADR-0070 made durations sub-day

`activities.remaining_duration_minutes` is stored in **minutes** and the engine consumes minutes
(`EngineActivity.remainingMinutes`). The public API does not carry them:

- `update-activity-progress.dto.ts` accepts **`remainingDurationDays`** only.
- `activity-response.dto.ts` returns **`remainingDurationDays`**, via
  `minutesToDays(entity.remainingDurationMinutes, entity.dayFactorMinutes)`.
- `@repo/types` exposes `remainingDurationDays: number | null`; `remainingDurationMinutes` appears
  nowhere in the web app.

This is TECH_DEBT #78 / ADR-0070 one field along, and ADR-0070 did not cover it. It now produces a
visible inconsistency: a planner types `4h` for a duration (works, shipped), reports progress, and the
remaining field can only say `0` or `1` day. A four-hour remainder reads back as `0` — which on an
incomplete activity is also the value meaning _no work left_.

The asymmetry sharpens it: the **derived** remaining (`percentComplete × durationMinutes`) is
minute-exact, so stating the remaining explicitly is _less_ precise than not stating it.

**Recommend fixing.** Smallest well-understood change here — the API half mirrors `api-v0.34.0`'s, the
web half reuses `@/lib/duration-text`, already built and tested.

### F4 — multiple float paths: engine + endpoint, no surface (outward)

The engine computes multiple float paths (`engine/float-paths.ts`, ADR-0035 §19, scenario S11) and
`GET …/schedule/float-paths` exposes them (`schedule.controller.ts:108`). **Nothing in
`apps/web/src` references the endpoint** — no component, no hook, no query key.

A capability construction planners actively want ("show me the second and third paths, not just the
critical one"), fully built and reachable only with `curl`. Whether it earns a surface is a product
call, not a defect call — but it should be a decision rather than an omission.

### F5 — capability matrix row N14 is stale (documentation)

`docs/specs/engine-conformance-framework/CAPABILITY_MATRIX.md` marks **N14 negative units** as
`⚪ M7 (resources deferred)`. Resources shipped, and N14 is implemented as a boundary reject in
**both** `create-assignment.dto.ts` and `update-assignment.dto.ts`, with the DB CHECK backstopping it.

The matrix's own summary says "0 ⚪". One row disagrees with the count printed above it. Cheap to fix,
and worth fixing because the matrix is the document people trust to say what is proven.

### F6 — assignment lag: the engine implements it, nothing can store it (outward, inverted)

The two capabilities the coverage report **excepts** are not equivalent, and the report's one-line
summary hides that.

`engine/resource-histogram.ts` takes a per-assignment **`lagMinutes`**, shifts the effective span
(`effStart = a.calendar.addWorkingTime(a.start, a.lagMinutes)`, line 222) and is scored against the
fixture's own 24-hour lag case (**AS0027**). The behaviour is built and tested.

There is **no `lag` column on `ResourceAssignment`** — only a comment in the schema mentioning one.
So there is nothing to store, nothing on the DTO, nothing on screen, and the coverage exception reads
"an assignment has no lag field: work starts with its activity". That is true of the data model and
badly undersells the position: the expensive half is done.

This is the register's other findings **inverted**. Normally storage and the read model support what
no write path can produce (F2, F3); here the **engine** supports what no storage can hold. Same
failure mode, opposite end — a capability finished in one layer and never carried through the others,
with a document recording the omission as if it were a design decision.

Cost is a column, a DTO field, a control and the wiring — comparable to F3, not to a new feature.

**`res_role` is genuinely absent**, and genuinely large: a role library, role-or-resource assignment,
and a swap step, touching resources, levelling, cost and interchange. That one is an epic and needs
its own spec, plan and ADR.

**Decision (2026-08-02, product owner):** take assignment lag now, alongside the other fixes; scope
roles separately, later. Recorded here because "2 excepted" reads as one item and is two very
different ones.

## Verified clean

Checked and found to have a real surface, recorded so the next pass does not re-derive it.

**Every plan-level engine option** — scheduling mode, progress recalc mode, expected-finish toggle,
critical-path definition, critical float threshold, total-float mode, make-open-ends-critical, level
resources, level-within-float-only, ignore-external-relationships, EAC method, currency, planned
start, plan calendar.

**Every writable per-activity field** on `update-activity.dto.ts`, including the ones most likely to
have been forgotten: `levelingPriority`, `expectedFinish`, `externalEarlyStart` /
`externalLateFinish`, `secondaryConstraintType` / `Date`, `scheduleAsLateAsPossible`, `durationType`,
`percentCompleteType`, `physicalPercentComplete`, `accrualType`, `budgetedExpense` / `actualExpense`,
`parentId`, `visualStart`, `laneIndex`.

**Every writable resource-assignment field** — `budgetedUnits`, `unitsPerHour`, `isDriving`,
`curveType`, `budgetedCost`, `actualCost`, `actualUnits`.

**Dependency** — `type`, `lagMinutes` / `lagDays`, `lagCalendar`, all authorable since ADR-0070 M3.

**Earned value** — the panel consumes the full set the read-model returns (`pv`, `ev`, `ac`, `sv`,
`cv`, `spi`, `cpi`, `bac`, `eac`, `vac`). Nothing computed and dropped.

**Programme / cross-plan** — `features/cross-plan-dependencies/` and
`features/schedule/components/ProgrammeScheduleSection.tsx`. (Known, recorded in ADR-0070 §6: the
cross-plan lag DTO still carries no `lagMinutes`.)

**Resource histogram** — `features/resources/components/ResourceHistogram.tsx` consumes the endpoint.

**Baseline variance** — the panel and table read the variance fields. `baselineTotalFloat` and
`currentTotalFloat` are returned and not read, but their derived `floatVarianceDays` **is** shown;
displaying the difference rather than both operands is a reasonable choice, not a gap.

**Application-level capability coverage** — the ADR-0066 catalogue already answers the inward
question at scale, and its own tool reports it:

```
Capability coverage: 115/117 reached, 2 excepted, 0 missing
  excepted  res_assignment_lag   an assignment has no lag field: work starts with its activity
  excepted  res_role             SchedulePoint has no role model; a resource is assigned directly
```

Every capability the P6-class fixture names is either demonstrated by a plan built **through the
public REST API** or excepted with a stated reason. This was the largest open question in the first
pass of this audit and it is closed — by tooling that already existed.

## Limits of this audit

Stated so the register is not read as stronger than it is.

- **Reachability was established by static reference**, not by driving each control in a browser. A
  field referenced by a component is not proof the control is enabled, reachable behind its flag, or
  correct — only that the surface exists. The five findings are all cases where the reference is
  _absent_, which is the direction that can be settled statically.
- **Correctness** at the application level rests on the ADR-0066 pairwise differential, which
  compares the application against `computeSchedule` on the same `SeedSpec` across a 63-plan covering
  array — pairwise, not exhaustive over all 117 keys.
- **Coverage ≠ correctness.** The 115/117 above says every capability has a plan that reaches it; the
  differential says the application and the engine agree on the plans it runs. Together they are a
  strong answer, and they are not the same claim.
- Not examined: permissions and org-scoping per surface (that is the security review's job), and
  whether each surface is _usable_ as opposed to present (the UX review's).
