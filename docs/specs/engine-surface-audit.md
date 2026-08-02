# Engine ↔ planner surface audit — findings register

> **Status:** audit complete for the scope stated in _Limits_ below. **Eight findings.** F7 was
> found by the surface-contract gate on its first run, not by the manual sweep; F8 was found while
> building F7's control, and blocked it. **Resolved: F1, F2, F5, F7+F8.**
> **Open: F3, F4, F6.**
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

### F2 — a calendar exception cannot span more than one day (outward, and the most practical) — **RESOLVED**

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

**Resolved in two halves.** The API half added `endDate` to the create DTO with an inverted-range
422; the web half added **From** / **To (optional)** to the exception editor, made the row and every
announcement read the span rather than its first day, and made an exception's **last** day editable
— the first day still is not, because moving an exception is remove-then-add, but extending a
shutdown is neither of those and the alternative is the delete-then-recreate the edit endpoint
exists to remove.

Two things fell out of it that the finding did not anticipate. Extending a range can now **collide**
with the next exception along, which is the same conflict as a duplicate day — so both write paths
go through one `runExceptionWrite` translation of the exclusion constraint rather than two copies
that could drift about which 409 it is. And `buildWorkingTimeCalendar` expands **every day of every
exception** at build time; its own comment justified that with "the single-day API shape keeps it at
O(E)", a premise this finding removes. A 10,000-day span ceiling replaces it explicitly — a typo
guard, and the bound the engine's cost now rests on.

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

### F7 — the critical float threshold has no control (outward; found by the gate, not by me) — **RESOLVED**

`plans.critical_float_threshold` is writable on `update-plan.dto.ts` (line 101), exposed on the shared
type, and consumed by the engine as `ComputeOptions.criticalFloatThresholdMinutes`. Under the default
`TOTAL_FLOAT` critical-path definition it is the whole definition: an activity is critical when its
total float is **≤ this number**.

There is no control. Every reference in `apps/web/src` is a seed value inside a `.test.tsx` fixture;
`PlanScheduleSettings.tsx` renders "Critical-path definition", "Total-float measure" and "Open-ends
criticality" and stops. So the threshold is pinned at 0 for every plan, and a planner cannot ask the
question P6 users ask constantly — _show me what is within five days of critical_ — even though the
engine has always been able to answer it.

**This one was found by the surface-contract gate, not by the manual audit above**, on the gate's
first run. The audit missed it because I grepped the plan settings as a combined list and saw hits,
which is precisely the shortcut a script does not take. Cheapest fix on the register: one number field
in a dialog that already exists, beside the setting it governs.

**Resolved** by `PlanCriticalFloatThresholdField.tsx`, rendered by `PlanScheduleSettings` last in the
group — the threshold only means anything under the `TOTAL_FLOAT` definition two controls above it,
and reading it first inverts the sentence. It reads the ADR-0070 `d`/`h`/`m` grammar rather than a
raw minute count, which is what makes F8's storage change survivable for a planner; see F8 for why
the two had to ship together and what the field says out loud about _which_ calendar's day it means.

### F8 — the critical float threshold is converted at a flat 1440, while float is not (correctness) — **RESOLVED**

Found while building F7's control, by asking what its unit means before drawing a box for it.

`plans.critical_float_threshold` is documented and validated as **whole working days**
(`update-plan.dto.ts` ~line 92, `@IsInt @Min(0)`). The service converts it for the engine as

```ts
criticalFloatThresholdMinutes: plan.criticalFloatThreshold * MINUTES_PER_DAY; // schedule.service.ts:958
```

where `MINUTES_PER_DAY` is a flat **1440** (`day-compat-calendar.ts:2`). The engine then compares it
against a total float measured in working minutes **on the activity's own calendar** (`types.ts:20`,
ADR-0037 §4).

On a 24-hour calendar those agree. On an **eight-hour** calendar — the shape ADR-0067 made authorable
and ADR-0068 made a first-class quantity — one "day" of float is 480 working minutes, so a planner
asking for a **1-day** threshold gets 1440 minutes, i.e. **three working days** of float treated as
critical. This is ADR-0068's defect one field along: a day-denominated value converted at 1440
instead of the calendar's own hours-per-day.

**It has never bitten, for exactly one reason: the threshold is pinned at 0** (F7 — no control sets
it), and `0 × anything` is 0. So the two findings are entangled: **shipping F7's control is what
would make F8 bite**, on the default critical-path definition, silently, in the direction of calling
too much work critical.

F7 therefore must not ship on its own. The fix is to convert on the same factor the float was
measured on — which is per-activity, so the honest options are (a) resolve the threshold per activity
at comparison time, or (b) redefine the field as minutes and let the control carry the ADR-0070
`d`/`h`/`m` grammar, which already knows how to ask a calendar what a day is worth.

**Resolved by (b)**, in two commits that had to be one release. The column became
`critical_float_threshold_minutes` (migration `20260802120000`, backfilled `× 1440` in `bigint` with
a clamp, so every existing value keeps the meaning it had — an identity for every row, not only for
the zeros); `schedule.service.ts` now passes it through with **no factor at all**, because there is
no scalar that is right for a plan whose activities sit on different calendars. That is exactly why
the column is minutes and the _control_ — not the service — does the day arithmetic.

The control resolves a day on the **plan** calendar and **says so in the hint**, because the
threshold is plan-level while total float is measured on each activity's own calendar (ADR-0037 §4).
On a mixed-calendar plan that is a disclosure, not a fix: an activity on a different calendar is
still compared against a figure typed in the plan calendar's days. Naming the day you are typing in
beats the status quo ante, where nobody was told anything and the number was silently trebled.

One latent bug fell out of the same read: `apps/api/test/pairwise/spec-to-engine.ts:86` fed **days**
into the minutes-denominated option while the service multiplied, so the differential harness and the
application disagreed about the unit — invisible while the value was pinned at 0.

Two more flat-1440 conversions sit in the same file — `relativeFloat / MINUTES_PER_DAY` (line 575,
the float-paths read-model) and `durationMinutes / MINUTES_PER_DAY` (line 905). **Neither has been
checked.** They are named here so the next pass starts from a list rather than a search.

## The gate

`pnpm check:surface-contract` (`scripts/check-surface-contract.mjs`) now enumerates every writable
field on a scheduling DTO and every CPM engine input — 200 of them — and requires each to be
classified in `scripts/surface-contract.json` as `surface` (a planner can author it, and where),
`exempt` (deliberately not, and why) or `gap` (a known hole, and which finding owns it). It fails on
an **unclassified** field, not on an honestly-marked gap, because a gate that fails on day one gets
deleted rather than fixed (ADR-0058).

Current state: **192 surfaced, 8 exempt, 2 gaps** — both F3.

**What it cannot catch, so nobody trusts it further than it goes.** It enumerates fields that exist.
It is blind to a field that _should_ exist and does not — F2's missing `endDate` on the exception
create DTO and F6's missing `lag` column are absences with nothing to enumerate. Half this register's
findings are of that kind and still need a human holding a storage model against a write path.

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
