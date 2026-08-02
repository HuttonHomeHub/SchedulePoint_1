# ADR-0071 (DRAFT): Per-assignment lag, and what it costs the levelling and Earned-Value parity arguments

> **This is a draft, held in the feature's spec directory pending approval.** On approval it lands as
> `docs/adr/0071-per-assignment-lag.md`. **0071 is the next free number** — `docs/adr/` runs to 0070
> (`0070-sub-day-durations-and-lags-in-the-authoring-surface.md`), verified by listing the directory rather
> than by counting the ADR list in `CLAUDE.md`, which has drifted before.

- **Status:** **Proposed** (per-milestone acceptance: M1 histogram, M2 levelling, M3 Earned Value)
- **Date:** 2026-08-02
- **Deciders:** Product Owner (scope decision of 2026-08-02, and the three critical questions in the spec);
  feature-analyst (design); database-architect (the column, already designed)

## Context

`engine/resource-histogram.ts` has taken a per-assignment **`lagMinutes`** since the ADR-0044 rung-5 slice
landed. It shifts the effective span to `[start + lag, finish)` on the activity's own calendar
(`resource-histogram.ts:222`, `:224`) and is scored against the P6-class fixture's own 24-hour case
(`AS0027`, `resource-histogram-conformance.spec.ts:156-168`).

**Nothing in SchedulePoint can store one.** There is no column on `ResourceAssignment`
(`prisma/schema.prisma:2065-2169`), no DTO field, no `@repo/types` field and no control. The production
caller hardcodes `lagMinutes: 0` (`schedule.service.ts:740`) under a comment asserting that
"SchedulePoint does not model a per-assignment lag column … production always distributes over the whole
activity span." The capability report excepts the key with a sentence — _"an assignment has no lag field:
work starts with its activity"_ (`apps/seed-cli/src/capabilities/coverage.ts:46-49`) — that reads as a design
decision and is an omission with a finished engine behind it.

This is the engine↔planner surface audit's **F6**, and it is the register's other findings **inverted**.
F2 and F3 are storage and read models supporting what no write path can produce; here the **engine** supports
what no storage can hold. Same failure mode, opposite end — and, as with ADR-0067 and ADR-0070, a document
recording the omission as though it were a decision.

Three concrete costs today. A crane assigned to a four-week activity loads the plant histogram from day one,
so a planner booking from it books a fortnight early. `level.ts` occupies the resource across the **whole**
activity span (`:149`, `:253`), so a late-joining resource is reserved for days it is not there and levelling
pushes other work out for capacity nobody took — safe, and pessimistic. And `earned-value.ts` phases the
whole planned value across the activity window (`:334-356`), so cost that cannot be incurred until week five
appears to accrue from week one, which is exactly the shape a QS reads a cash-flow curve for.

**The forces.** The lag is cheap in one consumer and expensive in the other two, and it is the _parity
arguments_ that make the difference. The histogram is a pure read-model that never enters `computeSchedule`;
wiring it is one line. Levelling's ADR-0041 parity argument, by contrast, is currently **structural** —
`EngineAssignment` is `{ activityId, resourceId, unitsPerHour }` (`engine/types.ts:162-167`) and there is no
field a lag could travel on, so it is _impossible_ for the pass to see one. Feeding the lag in retires that
sentence. And Earned Value's PV phasing is not a wiring change at all: `accrualType` is activity-level by
design (ADR-0044 §32) and PV is one cost, one window, one percentage — per-assignment phasing is a **new
model**.

The narrower scope (histogram only) was recommended by the analyst and **overruled by the product owner on
2026-08-02**, who chose the full scope across all three consumers. That is settled; what remains is to state
honestly what each of the three costs, which is what this ADR is for.

## Decision

**We will add an unsigned `lag_minutes` column to `resource_assignments` and carry it through all three
resource consumers — the histogram, the levelling pass and the Earned-Value PV phasing — restating
ADR-0041's parity argument rather than weakening the feature to preserve it, and extending ADR-0042/0044's
PV model to phase per cost component.**

### 1. Storage — unsigned, activity-calendar-framed, constant-defaulted

`resource_assignments.lag_minutes INTEGER NOT NULL DEFAULT 0`, with
`ck_resource_assignments_lag_minutes_range CHECK (lag_minutes BETWEEN 0 AND 5256000)` (≈ 10 years, mirroring
the dependency lag bound). Constant default ⇒ **no data migration and no table rewrite**, and every existing
row keeps today's behaviour — the M0 acceptance bar.

Three deliberate refusals, recorded so they are not later read as omissions:

- **Unsigned, unlike `dependencies.lag_minutes`.** A _lead_ is meaningful on a logic edge and meaningless
  here: a resource cannot join before the work starts. The shipped read-model already applies the lag only
  when `> 0`, so a signed column would be a trap — a negative would be **silently discarded**, the
  assignment would behave as unlagged, and the API would have said yes. The reject therefore lives at the
  **DTO** (`@Min(0)`, **N34**), the CHECK is defence in depth, and the `> 0` guard stays as the **parity
  fast path and is explicitly not a validation**.
- **No `lag_calendar` sibling.** A dependency lag needs one because an edge sits between two activities on
  potentially different calendars. An assignment lag has exactly one natural frame — the activity's own
  calendar (ADR-0037), which is what `resource-histogram.ts:222` already uses. A sibling enum would create a
  seam with **three** consumers to keep in step for a choice no fixture case asks for. It is additive if
  ever wanted.
- **No index.** Read only as part of the plan-scoped assignment loads the histogram, levelling and EV already
  run; never a `WHERE` or `ORDER BY` predicate. The `curve_type` precedent, and the ADR-0053 M4 rule that an
  index is added on a measurement, not on an instinct.

It is also **not captured in the ADR-0025 baseline snapshot**, which is what makes §3's PV split an
approximation rather than an exact decomposition. That is stated below rather than discovered.

### 2. Levelling — the parity argument changes, and we say so in those words

Today's claim is that it is _structurally impossible_ for `levelSchedule` to see a lag. After this it becomes
**two gates, proven differently**:

> **Gate A (structural, unchanged).** `computeSchedule` is byte-identical. The lag never reaches the pure
> network pass: `EngineAssignment[]` is only assembled inside `if (plan.levelResources)`
> (`schedule.service.ts:970-1006`), and `computeSchedule` takes no assignments at all. Pinned by a structural
> test on its signature, the ADR-0053 M3 `EngineResource`-shape precedent.
>
> **Gate B (data-conditional, new).** With `levelResources` **on** and every participating assignment at
> `lagMinutes === 0` — the constant column default, therefore every plan in the system on the day this ships
> — `levelSchedule` returns output byte-identical to the pre-change implementation.

**Gate B is weaker than "structurally impossible", and that is the price.** It is proven by three
independent instruments, none substituting for the others: a property/snapshot corpus captured from the
**current** implementation **before** the refactor (a snapshot taken afterwards asserts the refactor against
itself); the S10 conformance differential and the `single-unit-resource-serialises-second` golden re-run
unchanged; and the ADR-0066 pairwise differential over the levelling dimension, which builds the engine's
input **from the `SeedSpec`, never from the persisted rows** — the only instrument that can catch a value
that reaches the database and fails to reach the engine, which is the class of defect ADR-0066 exists for.

**The algorithmic change is two halves that must land together.** Occupancy (`level.ts:149`, `:253`) shifts
to `[advanceWorking(calA, start, lag_i), finish)` per assignment. And the placement search
(`earliestFeasibleStart`, `:336-407`) can no longer test **one** run window, because resource _i_ is needed
only over `[cand + lag_i, cand + d)`: each resource's blackout `[b0, b1)` forbids candidate starts
`c ∈ ( advanceWorking(b0, −d), advanceWorking(b1, −lag_i) )`, and the answer is the first point ≥ the rolled
early start not covered by the union of those intervals. This preserves the `O(k log k)` cost, the inherent
termination (every placed interval finishes, so the union is bounded above), the determinism (the composite
`levelingPriority → totalFloat → earlyStart → id` order is untouched), and — the point — reduces to today's
fit test exactly when every offset is zero.

Changing occupancy **without** the search is rejected: the pass would then reserve `[start+lag, finish)`
while refusing to place anything needing `[start, start+lag)` — conservative in the search, optimistic in the
profile, invisible except on the dense plans where both matter.

**Non-monotonicity, stated deliberately.** Today's behaviour over-reserves, so a lag strictly shrinks that
assignment's demand footprint. The tempting next sentence — "levelled dates can therefore only move earlier"
— is **false**. `levelSchedule` is a serial priority-list heuristic (ADR-0041 §1): freeing capacity can let
an earlier-in-order activity be placed earlier, whose occupancy then blocks a later-in-order activity that
previously fitted there. So an individual activity can move **later** even though total contention fell.
Consequently **no monotonicity test is written** (it would pass on the examples someone thinks of and fail in
CI on the one they did not), and **no release note or UI copy may promise it**. The honest sentence is:
_"the resource is no longer reserved for the days it is not on site; the levelled programme is recomputed and
individual dates may move in either direction."_

### 3. Earned Value — a new PV model, described as one

PV moves from one activity-level percentage to a **cost-component-weighted sum**:

```
PV = round( Σ_c  pvCost_c × plannedPercent_c / 100 )
```

The activity's **expense** keeps the activity window `[start, finish)` — an expense is attached to no
resource and has no lag. Each **assignment** takes `[start + lag_a, finish)`. Both are phased by the
**same activity-level `accrualType`**: ADR-0044 §32 is **extended, not overturned**, because the accrual
governs _shape_ and the lag governs _when the window opens_, and they compose without a new column. `START`
on a lagged assignment recognises at `start + lag`; `UNIFORM` spreads across the lagged window; **`END` is a
no-op**, because it recognises at the activity finish, which the lag does not move — worth saying, because it
is the case a reader assumes changed.

**Splitting `pvCost` — the approximation, written down.** PV's cost source is `baselineBudgetedCost ?? bac`,
a single activity-level number: the ADR-0025 snapshot does not decompose by assignment. We allocate it by
**live budget shares** (`share_c = liveCost_c / liveBAC`, using the exact expressions `leafBudgetAndActual`
already sums, `earned-value.ts:284-292`), guarding `liveBAC === 0` by falling through to the single-window
path. This is exact whenever `pvCost === bac` (the live-budget fallback). **When a cost baseline exists and
the assignment mix has changed since capture, the split approximates a decomposition the snapshot never
held.** That goes in this ADR's consequences _and_ in the endpoint's OpenAPI description, because an
approximation nobody wrote down is how an invisible defect starts. Extending the baseline to carry
per-assignment cost is the recorded follow-on (a schema change and an ADR-0025 amendment) and is the spec's
**CQ-1**.

**Parity by an explicit fast path, not by numerical luck.** With every lag zero, all component percentages
are equal, so the component sum equals today's expression _in exact arithmetic_ — but not provably in
IEEE-754, since `Σ share_c` need not be exactly 1. Relying on `Math.round` to absorb that is a coin flip on
±1 minor unit, on every existing plan, silently. So `computeEarnedValue` **takes the existing single-window
expression verbatim** when no participating assignment has `lagMinutes > 0`, mirroring the histogram's own
`> 0` guard and `resolveCurveProfile`'s `null` fast path. EV parity is therefore **structural rather than
numerical**, pinned by the existing EV conformance goldens being byte-unchanged, a structural test that the
fast path is taken, and a flip-one-option differential proving the output _does_ change when a lag is set.

`EV`, `AC`, `BAC`, the WBS rollup and every derived ratio are **unchanged** — only PV time-phasing reads a
window. The response gains one additive `costPhasingLaggedCount` (a sibling of `costWarningCount` /
`stepWeightZeroCount`), 0 on every plan with no lag, so a reader can tell which numbers came from the new
model.

**And the recalc parity gate is still structurally trivial for EV**: it never enters `computeSchedule`, adds
no write pass and owns no persisted column (ADR-0042 §2). What changes is the EV **read contract**, not the
recalc gate — a distinction the docblock must now carry, because it currently states only the second.

### 4. The engine's own guard — a typed error and a 422, not a 500

`WorkingTimeCalendar.addWorkingTime` throws a bare `new Error(...)` past its ~200-year horizon
(`working-time-calendar.ts:306-308`, `:326-328`), and the histogram's call site catches **only**
`HistogramTooManyBucketsError` (`schedule.service.ts:745-755`) — everything else becomes a 500. Today that
branch is dead because `lagMinutes` is the constant `0`. Making the lag client-settable puts a user value on
that path, and the branch is **reachable with legal data**: the CHECK caps the lag at 5,256,000 _working_
minutes, and a window-only calendar (a valid shape, ADR-0036 §2) can need more than 200 years to supply them.

So: a typed `WorkingTimeHorizonExceededError` replaces both bare throws; the histogram catches it per
assignment and rethrows `HistogramLagUnreachableError { activityId, resourceId }`, because a 422 that names
_which_ assignment is actionable and one that says "somewhere in this plan" is not; all three read paths map
it to **422 `ASSIGNMENT_LAG_UNREACHABLE`**; and the assignment write path pre-flights the walk when
`lagMinutes > 0`, which is necessary but **not sufficient** (a calendar can be narrowed after the lag is
stored), so the runtime mapping is the backstop and both exist.

Levelling must **not** swallow it. `level.ts:221-228` deliberately coerces a throw to `coverage = 0` for the
_window-coverage probe_, which is correct there; the new occupancy walk gets no such treatment, because a
recalc that quietly places activities using a lag it could not resolve is worse than a failed recalc. _(The
alternative — ADR-0035's house "produce-and-flag" style — is the spec's **CQ-2**, and it points the other
way, which is why it is a question rather than a default.)_

### 5. Interchange — a shape now, a parser only after a real export is read

The repository's own P6-class XER declares `TASKRSRC` as
`taskrsrc_id task_id rsrc_id target_qty target_qty_per_hr driving_flag act_reg_qty`
(`packages/engine-conformance/fixtures/p6_torture_test_v1.xer:378`) — **no lag column of any kind**. This
repository therefore contains **no evidence** of the P6 field's name, its units, or whether P6 emits it at
all. **We will not code it from memory**: that is the ADR-0058 failure mode with a column name attached.

So the canonical model gains `lagMinutes` (default 0), the ADR-0050 mapping-contract table records assignment
lag as **not imported and dropped on export, with a report finding, in both formats**, and the XER parser and
emitter are **blocked** until a real P6 export carrying an assignment lag has been inspected and the column
name and units recorded in that table. **MSPDI is a drop in both directions.** MS Project's
`<Assignment><Delay>` is a plausible equivalent; it is read nowhere in this repo and has not been checked
against a real file, so it sits in the same confirm-first bucket rather than being wired on assumption.

### 6. Semantics, conformance and the catalogue

ADR-0035 gains **§34** (assignment-lag semantics: unsigned; the activity's own calendar; the degenerate-lag
asymmetry across the three consumers; the `END`-accrual no-op; the live-share PV approximation) and **N34**
(negative lag, oversized lag, unreachable-horizon lag — all 422), accepted per milestone in that ADR's
ledger. The `res_assignment_lag` coverage exception is **deleted in the same PR** as the capability plan that
reaches it, or `seed --coverage` reports it as a _missing_ key. `CAPABILITY_MATRIX.md` gains a **new row** —
the key appears nowhere in it today, only as a clause inside the _curves_ row — and the levelling row's
sentence "the curve read-model does NOT feed this levelling pass (Q2)" gains "the assignment **lag** now does
(ADR-0071)", or it becomes the next stale document. `docs/TEST_PLAYBOOK.md` gains a row (gated in both
directions by `pnpm check:playbook`).

### 7. Surface, permissions and the pen

One `d/h/m` text field (ADR-0070's grammar, with `hoursPerDay` as a **required** parameter — never defaulted,
because after ADR-0068 defaulting to 24 reads `1d` on an eight-hour calendar as three days' work and
defaulting to 8 does the reverse) on the **shared, extracted** `ActivityResourcesPanel`, so the tab and the
dialog cannot drift (ADR-0062). Behind `VITE_ASSIGNMENT_LAG`, default off, with flag-off parity suites kept
as the rollback contract.

The write is **structural** — with `levelResources` on it moves engine-owned leveled columns — and it
**already holds the pen**: `assertHoldsPen` has been on the assignment write path since ADR-0040 made an
assignment write able to persist a derived duration (`resource-assignment.service.ts:111-115`). No new gate.
`resource:assign` (Planner + Org Admin) with org scope; **not** cost-gated (a lag is schedule data, the
ADR-0044 Q5 "units are schedule data, not cost" precedent); **not** exposed to External Guests (the
`SCHEDULE_READ` share scope carries no resources at all, ADR-0051).

## Alternatives considered

- **Histogram only.** The analyst's recommendation; **overruled by the product owner, 2026-08-02**. Its
  merit was a trivial parity story; its cost was three consumers disagreeing about one stored number, which
  is F2/F3/F6 one layer along.
- **A signed lag.** Rejected: a lead is meaningless on an assignment, and the shipped read-model silently
  discards a negative — a signed column would be a trap dressed as symmetry with `dependencies.lag_minutes`.
- **A `lag_calendar` sibling enum.** Rejected: one natural frame, three consumers to keep in step, no fixture
  case asking. Additive later.
- **Shift the _activity_ rather than the assignment's demand window in levelling.** Rejected: that is a
  scheduling change, not a demand change, and it would break Gate A.
- **Keep the uniform-window placement search and change only occupancy.** Rejected: the two halves would
  disagree — conservative in the search, optimistic in the profile — and only on the dense plans where it
  matters.
- **Per-assignment `accrualType`.** Rejected for this epic: the lag already supplies the window; a second
  axis with no fixture case behind it, and ADR-0044 §32 chose one activity-level value over a per-expense
  table for the same reason.
- **Extend the baseline snapshot to carry per-assignment cost (exact PV split).** Deferred — a schema change,
  an ADR-0025 amendment, a migration, and existing baselines that cannot be back-filled, so the approximation
  would still apply to every baseline captured before it. The spec's **CQ-1**.
- **Rely on `Math.round` to absorb the component-sum rounding difference.** Rejected — it is a silent ±1
  minor unit on every existing plan, decided by IEEE-754. The explicit fast path costs one branch.
- **Guess the XER column name.** Rejected — §5.

## Consequences

**Positive.** The engine↔planner register's inverted finding (F6) closes; `seed --coverage` moves to
**116/117 reached, 1 excepted**, and the one that remains (`res_role`) is a genuine absence with an epic of
its own. Plant and labour histograms become usable for booking. Levelling stops reserving capacity nobody
took. The PV curve stops claiming cost accrues before the resource that incurs it exists. All of it is
additive, constant-defaulted and behind a default-off flag, with each consumer separately revertible.

**Negative / cost.** ADR-0041's parity argument is **materially weaker**: "structurally impossible" becomes
"data-conditional on a column default", and that is a claim a future reader must re-verify rather than read
off a type signature. The levelling placement search — the pass's cost centre and its determinism guarantee —
is rewritten, which is the highest-risk change in the epic; it is mitigated by capturing goldens **before**
the change, but mitigation is not immunity. Earned Value gains a genuinely new PV model whose baseline split
is a **documented approximation**, and the honest reading is that a plan with a cost baseline and a changed
assignment mix gets a PV curve that is _more_ right than today's and still not exact. The interchange half is
**blocked on evidence this repository does not contain**. And levelling's behaviour under a lag is
**non-monotone**, which will surprise a planner who expects "less reservation, earlier dates" and must be
said in the release note rather than left to be reported as a bug.

**Neutral / follow-ups.** ADR-0035 gains §34 + N34. `@repo/types`, the OpenAPI spec, `docs/API.md`,
`docs/DATABASE.md`, `CAPABILITY_MATRIX.md`, `TEST_PLAYBOOK.md`, `TECH_DEBT.md`, the ADR-0050 mapping table and
the engine-surface audit register all move in lock-step. Recorded follow-ons: the exact baseline PV split
(CQ-1 option B); the XER round-trip once a real export is read; `res_role`, which F6 correctly separates as
an epic of its own.

## References

- [`docs/specs/assignment-lag/feature-spec.md`](./feature-spec.md) and
  [`implementation-plan.md`](./implementation-plan.md) — this decision's spec and plan.
- [`docs/specs/engine-surface-audit.md`](../engine-surface-audit.md) **F6** — the finding, and the product
  owner's 2026-08-02 scope decision recorded there.
- [ADR-0041](../../adr/0041-resource-levelling.md) §2/§3/§7 — **amended** (not superseded) by §2 above.
- [ADR-0042](../../adr/0042-percent-complete-types-and-earned-value.md) §2 and
  [ADR-0044](../../adr/0044-resource-curves-accrual-steps.md) §32 — **extended** by §3 above.
- [ADR-0034](../../adr/0034-engine-conformance-methodology.md) (parity gate, three tiers, flip-one-must-differ)
  and [ADR-0035](../../adr/0035-schedulepoint-cpm-semantics.md) (**new §34**, **N34**).
- [ADR-0036](../../adr/0036-hour-granular-calendars-and-durations.md) / [ADR-0037](../../adr/0037-per-activity-calendars-and-instant-axis.md)
  (working-minute axis, per-activity calendar ports, the horizon this decision's §4 is about).
- [ADR-0039](../../adr/0039-resource-model-and-resource-calendar-scheduling.md) / [ADR-0040](../../adr/0040-duration-types-and-resource-units.md)
  (the assignment model this column joins).
- [ADR-0050](../../adr/0050-schedule-interchange-canonical-model.md) (the mapping contract §5 updates) and
  [ADR-0053](../../adr/0053-calendar-scoping-and-resource-management.md) §3/§4 (GROUP and archive invariants
  that keep the parity argument structural at the resource end).
- [ADR-0066](../../adr/0066-the-seed-catalogue-and-the-engine-as-oracle.md) (the coverage exception this
  deletes, and the pairwise differential that proves Gate B at the application).
- [ADR-0058](../../adr/0058-drift-control-and-the-reconciliation-pass.md) — the rule this ADR's §5 and §0 of
  the spec apply: _verify the claim; do not trust the document._
- [ADR-0028](../../adr/0028-plan-edit-lock.md) (the pen the write already holds),
  [ADR-0012](../../adr/0012-authorization-rbac-scoped.md) / [ADR-0016](../../adr/0016-core-identity-tenancy-role-model.md)
  (RBAC + tenancy), [ADR-0051](../../adr/0051-external-guest-share-links.md) (why guests see none of this),
  [ADR-0062](../../adr/0062-activity-editor-convergence-logic-resources-notes-as-tabs.md) (the extracted panel
  the field lands on), [ADR-0068](../../adr/0068-calendar-hours-per-day.md) /
  [ADR-0070](../../adr/0070-sub-day-durations-and-lags-in-the-authoring-surface.md) (the `d/h/m` grammar and
  the required-`hoursPerDay` rule).

---

## Decisions taken (product owner, 2026-08-02)

The spec left three critical questions open rather than defaulting them away. All three are now
answered, and one **overturns the spec's own default** while another **overturns mine**. Recorded
here rather than in a chat thread, because a decision that lives only in conversation is the drift
ADR-0058 exists to stop.

**CQ-1 — PV split when a cost baseline exists: _extend the baseline_ (option B).**

The spec defaulted to allocating baselined PV by **live** budget shares, documenting the
approximation; I recommended the same, on the grounds that it ships without a schema change. That is
overruled. ADR-0025 is amended so a cost baseline snapshots **per-assignment** cost, making the split
exact for every baseline captured after it.

The consequences are real and are accepted, not discovered later: the baseline schema is **in scope**
for this epic, ADR-0025 takes an amendment rather than a reference, and **baselines captured before
this ships cannot be back-filled** — a per-assignment breakdown that was never recorded cannot be
recovered from a frozen total. Those keep the live-shares approximation permanently, so the read
model must carry both paths and say which one a given baseline is on. A baseline is a frozen copy
(ADR-0025's central call), and this makes it a more faithful one.

**CQ-2 — an unresolvable stored lag at recalculation: _produce-and-flag_.**

The spec defaulted to a hard 422 and flagged that ADR-0035's house style points the other way. It
does, in three places — mandatory constraints (§7), external dates (§30) and LOE no-span (§21) — and
the house style wins. The activity schedules with the lag dropped, carries a per-activity flag, and
the plan carries a count.

The reasoning is that a recalculation which refuses outright takes a whole plan down for a data
problem in one row, and a planner cannot act on an error that hides the schedule they need in order
to find the row. The **write-time pre-flight stays** and is the first line of defence: the honest
place to refuse an unreachable lag is the edit that creates it, where the planner is looking at the
one assignment concerned.

**CQ-3 — the shipped semantic is _confirmed_: a lag eats INTO the activity.**

`effFinish = a.finish` (`resource-histogram.ts:224`) stands. The activity's dates do not move; the
resource joins late and works a shorter window. This is what the AS0027 golden already asserts, so
confirming costs nothing — and it is how the case is described out loud ("the inspector shows up on
day eight" does not make the activity longer). The levelling and earned-value windows inherit the
same rule, which is the reason this was worth settling before M2 and M3 rather than after.

**Related, from the same round — the F7/F8 control's factor.** The critical float threshold is now
stored in working minutes (audit F8, landed). Its control resolves `d`/`h`/`m` against the **plan
calendar** and says so in its help text. On a mixed-calendar plan that is a disclosure, not a fix:
an activity on a different calendar is still compared against a threshold entered in the plan
calendar's days, and no single scalar can be right for all of them. Saying which day the planner is
typing in is strictly better than today, where nobody is told anything.
