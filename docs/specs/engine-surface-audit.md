# Engine ↔ planner surface audit — findings register

> **Status:** first pass, **incomplete**. Sections marked _not yet audited_ have not been checked
> and must not be read as clean. Nothing here has been fixed; this is the register the delivery
> process (§21) wants before any code.
>
> **Method:** ADR-0058's rule — _verify the claim; do not trust the document._ Every row below was
> established by reading the engine's input types, the Prisma columns, the DTOs and the web
> components, not by reading an ADR that says a thing is done.

## The two questions

- **Outward (engine → planner):** does every input and option the CPM engine accepts have a surface
  a planner can actually reach?
- **Inward (planner → engine):** does everything a planner can set actually reach the engine and
  behave as documented?

The second question is the one that produces the worse defects, because a control that is authorable
and inert looks exactly like a control that works.

## Findings

### F1 — `suspendDate` is authorable and inert (inward; the significant one)

A planner can set a **suspend date** on an in-progress activity. It is validated (a resume before a
suspend is a 422), stored in `activities.suspend_date`, returned on the activity DTO, rendered in the
progress editor, and exported to XER and MSPDI.

**The CPM engine never sees it.** `EngineActivity` has no `suspendDate` field;
`schedule.repository.ts` does not even `select` the column into the recalculation
(`resumeDate: true` is there, `suspendDate` is not); `engine/progress.ts` mentions suspension only in
a docblock about the **resume** instant.

ADR-0035 §4 makes two promises. The first — "remaining work is scheduled from
`max(data date, resume date)`" — **is** implemented, via `resumeDate`. The second — "the suspended
window is excluded from actual duration" — has **no implementation and no consumer anywhere**.

So the field is a record of when work stopped, not a scheduling input, and nothing on screen says so.
A planner who suspends an activity and recalculates gets the same dates they would have got without
it. That is the ADR-0064 "lit but inert" shape, in the progress model rather than the toolbar.

**Two honest resolutions, and they are genuinely different decisions:**

1. Implement §4's second clause — the suspended window stops counting, which changes computed actual
   duration and therefore dates. Real engine work, needs a conformance slice and a parity argument.
2. Declare the field a **record** — amend ADR-0035 §4 to say only `resumeDate` is load-bearing, and
   make the editor say it, so the control stops implying an effect it does not have.

I lean to **(2) first, on its own**, because it is honest immediately and cheap, and it does not
block (1) later. Shipping (1) silently would change dates on every plan that already carries a
suspend date.

### F2 — remaining duration is day-only, immediately after ADR-0070 made durations sub-day

`activities.remaining_duration_minutes` is stored in **minutes** and the engine consumes minutes
(`EngineActivity.remainingMinutes`). The public API does not carry them:

- `update-activity-progress.dto.ts` accepts **`remainingDurationDays`** only.
- `activity-response.dto.ts` returns **`remainingDurationDays`**, via
  `minutesToDays(entity.remainingDurationMinutes, entity.dayFactorMinutes)`.
- `@repo/types` exposes `remainingDurationDays: number | null`. `remainingDurationMinutes` appears
  **nowhere** in the web app.

This is TECH_DEBT #78 / ADR-0070 exactly, one field along, and ADR-0070 did not cover it. It now
produces a visible inconsistency: a planner types `4h` for a duration (works, ships today), reports
progress, and the remaining field can only say `0` or `1` day. A four-hour remainder reads back as
`0` — which on an incomplete activity is the same value that means _no work left_.

Note the asymmetry that makes it sharper: the **derived** remaining (`percentComplete × durationMinutes`)
is minute-exact, so the same activity gets an exact remaining if you report a percentage and a rounded
one if you state the remaining explicitly.

**Recommend fixing.** It is the smallest well-understood change in this register — the API half is the
same shape as `api-v0.34.0`'s, and the web half reuses `@/lib/duration-text`, already built and tested.

### F3 — multiple float paths: engine + endpoint, no surface (outward)

The engine computes multiple float paths (`engine/float-paths.ts`, ADR-0035 §19, scenario S11) and
`GET …/schedule/float-paths` exposes them (`schedule.controller.ts:108`). **Nothing in
`apps/web/src` references the endpoint** — no component, no hook, no query key.

This is a capability a construction planner actively wants ("show me the second and third paths, not
just the critical one") that is fully built and reachable only with `curl`. Whether it is worth a
surface is a product call, not a defect call — but it should be a decision, not an omission.

### F4 — capability matrix row N14 is stale (documentation)

`docs/specs/engine-conformance-framework/CAPABILITY_MATRIX.md` marks **N14 negative units** as
`⚪ M7 (resources deferred)`. Resources shipped (M7), and N14 is implemented as a boundary reject in
**both** `create-assignment.dto.ts` and `update-assignment.dto.ts`, with the DB CHECK backstopping it.

The matrix's own summary says "0 ⚪". One row disagrees with the count directly above it. Cheap to
fix, and worth fixing because the matrix is the document people trust to say what is proven.

## Verified clean

Checked and found to have a real authoring surface — recorded so the next pass does not re-derive it:

- **Every plan-level engine option**: scheduling mode, progress recalc mode, expected-finish toggle,
  critical-path definition, critical float threshold, total-float mode, make-open-ends-critical,
  level resources, level-within-float-only, ignore-external-relationships, EAC method, currency,
  planned start, plan calendar.
- **Every writable per-activity field** on `update-activity.dto.ts` — including the ones most likely
  to have been forgotten: `levelingPriority`, `expectedFinish`, `externalEarlyStart` /
  `externalLateFinish`, `secondaryConstraintType` / `Date`, `scheduleAsLateAsPossible`,
  `durationType`, `percentCompleteType`, `physicalPercentComplete`, `accrualType`,
  `budgetedExpense` / `actualExpense`, `parentId`, `visualStart`, `laneIndex`.
- **Every writable resource-assignment field**: `budgetedUnits`, `unitsPerHour`, `isDriving`,
  `curveType`, `budgetedCost`, `actualCost`, `actualUnits`.
- **Dependency**: `type`, `lagMinutes` / `lagDays`, `lagCalendar` — all three authorable since
  ADR-0070 M3.

## Not yet audited

Stated so this register is not mistaken for a complete one:

- **Calendars and exceptions** beyond what ADR-0067 closed — in particular whether every shape the
  `WorkingTimeCalendar` port accepts is reachable from the editor.
- **Cross-plan dependencies** (ADR-0045) — known: the DTO carries no `lagMinutes` (ADR-0070 §6), but
  the rest of the programme surface is unchecked.
- **Earned value and the resource histogram** read-models — endpoints exist; whether the panels
  consume every field they return is unchecked.
- **Baselines** — the variance read-model against what the panel shows.
- **Direction B at the application level**: the ADR-0066 seed catalogue proves the engine on 117
  capability keys, but which of those keys has a plan that reaches the engine **through the REST
  write path** has not been tabulated here. That table is the real answer to "is it working
  correctly", and it is the largest remaining piece of work in this audit.
