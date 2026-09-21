# ADR-0148 — Visual is the plan; the feasible window and the levelled ghost are overlays

- **Status:** Accepted
- **Date:** 2026-09-21
- **Supersedes:** nothing — ADR-0033 is amended, not withdrawn (see D1)
- **Amends:** ADR-0022 (execution), ADR-0025 (the fifth amendment), ADR-0033 (D5, D6, and the
  `schedulingMode` it introduced), ADR-0041 §7 (the levelling parity argument's second gate),
  ADR-0043/0045 (the cross-plan forward basis), ADR-0052 §3 (the mode-aware start-edge fork),
  ADR-0054 §4 (the float tail's datum), ADR-0126 (a baseline freezes the placement too), ADR-0134
  (the typed-date branches)
- **Spec:** [`docs/specs/one-planning-surface/`](../specs/one-planning-surface/)

## Context

ADR-0033 split a plan into two **scheduling modes**. `EARLY` drew every bar at the CPM earliest
date; `VISUAL` drew it where a planner had put it, and a second forward-only engine pass produced
`visualEffectiveStart`/`visualEffectiveFinish` for that case. It was the right decision for the
problem it was solving — the product had no column meaning "where the planner put this", and
inventing one for every plan at once was not affordable then.

**What it cost is that the product had two answers to "where is this bar?" and no way to tell which
one a given surface had used.** Three symptoms, each found by reading rather than from a report:

- A drag on an `EARLY` plan wrote a binding `START_NO_EARLIER_THAN` at the drop date, because a
  constraint was the only thing that could remember a position. That PATCH round-tripped fifteen
  definition fields and **overwrote whatever constraint the row already carried** — so moving a bar
  silently replaced a commitment somebody had recorded on purpose, and a bulk drag replaced twelve.
- The mode was a per-plan flag with no migration path, so an estate acquired plans in both, and
  every consumer that mattered — the canvas, the Gantt, the printed programme, the export, the
  cross-plan derivation, the parallel accessible listbox — had to decide for itself which column to
  read. They did not all decide the same way, and each was internally consistent, so only somebody
  opening one plan two ways could ever see it.
- The float a planner was shown was `totalFloat`, measured from where the **network** would put the
  bar. On a hand-placed bar that is not the number they can spend.

**And the second pass was never a superset of the first.** The spec opened by asserting that "Early
is Visual's resting state" and cited a fixture of five plain tasks — zero `actualStart`, zero
`remainingMinutes`, zero `WBS_SUMMARY`, zero `LEVEL_OF_EFFORT`. Measured against a fixture that has
them (`m-p/red-run.md`, produced by reverting only `compute.ts` and running the case before any
engine change), Pass 2 got a started activity's frozen actual start wrong, its remaining span wrong,
both of a complete activity's actuals wrong, and collapsed an LOE or a WBS summary to a point. So
the premise the whole collapse rests on was **false as stated**, for exactly the activity shapes a
real programme is made of, and it had to be made true before anything could read Pass 2 as
authoritative.

## Decision

**A plan has one planning surface. Where a bar is drawn is where it is placed, for every plan, with
no mode to consult.** The earliest, latest and levelled positions become read-only **overlays** on
that one picture rather than rival bases for it.

### D0 — Pass 2 is taught Pass 1's three branches before anything reads it as authoritative

The frozen actual start, the frozen actual finish, and the derived LOE/WBS-summary span. Ordered
first in the epic deliberately: every later milestone's parity argument is "the placed basis agrees
with the early basis where nobody has placed anything", and that sentence was not true until this
landed. It is the one milestone whose absence would have been invisible — a plan of plain
unprogressed tasks passes against the defect.

### D1 — `schedulingMode` is deleted; the placed dates are the single downstream truth

Removed from the plan DTOs, from `@repo/types` and from `apps/api/src`. A caller naming it gets a
**422**, not a silent drop, because `ValidationPipe` runs with `forbidNonWhitelisted` — a
silently-ignored field would let an old client go on "setting the mode" for ever, succeeding, and
changing nothing. `barDateSourceFor` loses its mode parameter rather than the callers agreeing to
stop passing one, so the compiler removes the question.

The database column and the `SchedulingMode` enum are dropped **one release later** (M-J-T2), not in
the same release, so the two halves can fail separately.

### D2 — Pass 1 is untouched, and it is not "Early mode"

`computeSchedule`'s network pass is byte-identical for every input: the golden suite and
`pureFields` pass **unedited**, which is the acceptance condition rather than a remark. It still
owns the float, the criticality, the late dates, the drift a placement is measured against, every
DCMA metric and the whole ADR-0034 conformance matrix.

**The parity claim is stated in four parts and its second part is withdrawn, not stretched**
(spec §4.10): Pass 1 untouched; ~~Pass 2's existing outputs byte-identical~~ — **withdrawn**, because
D0 changes them deliberately for started, complete, LOE and summary activities; two fields added
under an enumerated re-baseline; and, _after_ D0, a plan with no placement renders identically under
both bases **including** progress, LOE and summary. A withdrawn clause is recorded as withdrawn
because a parity sentence that has been quietly widened to stay true is worth nothing.

### D3 — The float a planner is shown is remaining float

`activities.remaining_float`, engine-owned, persisted, day-denominated, rounded **once** on the
server: `totalFloat − visualDriftDays`, subtracted in minutes. On an unplaced activity it equals
`totalFloat`, so the great majority of the estate reads identically.

Never derived client-side, and the reason is arithmetic rather than tidiness: **the difference of
two roundings is not the rounding of the difference**, and minutes are persisted for neither input.
The spoken and written read-outs say **"float left"** rather than "float", because without the word
the sentence silently changes meaning the first time somebody places a bar.

### D4 — One feasible window plus one rival ghost

The product owner chose this over three peer ghosts. The window is the span
`[earlyStart, lateFinish]`, drawn in the band ADR-0054's float and drift tails occupied — which it
**replaces**, so there is no separate tail left to correct and the corrected quantity _is_ the
window's right edge. It amends **ADR-0054 §4**: the tail's datum is the placed finish, so its length
is `T − d` and not `T`. It amends **ADR-0033 D6**: editing is never suppressed.

One `feasibleWindowRect`, one `traceWindowCap` for both caps. Two tracers is how the inverted case
ends up a half-pixel off, visible only on the placements the feature exists to show.

### D5 — The conflict flag gets its second side

ADR-0033 D5 specified two disjuncts and built one. `visualConflictReason` is
`EARLIER_THAN_LOGIC` (placed before the earliest feasible start — the shipped case) or
`LATER_THAN_BOUND` (the placed **finish** overran an `SNLT`/`FNLT`/`MSO`/`MFO` ceiling).
`visualConflict` survives as `visualConflictReason !== null`, with a database CHECK refusing a row
where the two disagree.

**Read the reason, never the boolean, wherever the sentence or the mark differs by direction**, and
that is a rule because two consumers got it wrong: the accessible Tier-1 sentence announced a bar
placed five days _past_ a ceiling as placed five days _before_ its earliest start (drift is signed,
and `Math.abs()` erased the sign before the word "before" was applied to it), and the canvas drew
both reasons' warning triangle at the bar's **start** — for `LATER_THAN_BOUND` the one end of the
bar nothing is wrong with, typically with the pin for the overrun bound sitting at the other.

### D6 — Drag-created `SNET`s are stripped on a four-class test, recorded first, reported after

**Binding** (`early_start = constraint_date`) converts to a hand-placement at that date. **Inert**
(`early_start > constraint_date` — logic already overtook it) is left: converting it would place the
bar earlier than logic allows. **Unclassified** (`early_start IS NULL` or below the constraint) is
left, and one of the two ways it arises **never clears**, because a started activity's actual start
bypasses the clamp. **Already placed** is left, because a row can hold a stale placement _and_ a
binding constraint — measured, removing that one clause destroys 706 hand-placements on a
102,000-activity estate.

The conversion and the record are **one set-based statement**, so the recorded set and the converted
set are the same set by construction. It bumps `version`, departing from every other data migration
here, and the departure is load-bearing: that convention exists so an _engine_ write stays invisible
to optimistic locking, and this writes a _planner-owned input_ and wants the opposite.

**The bars do not move and the float downstream does**, which is the point rather than a caveat: an
`SNET` binds through Pass 1 and a placement does not, so a successor's earliest falls, its float
rises and its criticality can change. The float that was never genuinely constrained comes back.

### D7 — Export reports the placement; it does not translate it

A hand-placement has no representation in XER or MSPDI that means the same thing. Translating it
into a constraint would put back, in a file somebody else opens, exactly the conflation this epic
removed. So the export carries one aggregate finding and the mapping-contract table records the
drop.

### D8 — No `VITE_` flag; the thirteen journey pins convert first

ADR-0088 D1 established that a `VITE_` constant is inlined at build time and has never been an
operator rollback, so a flag here would buy a second product to maintain and no ability to switch
anything off. The rollback is a commit boundary. The thirteen Playwright configs that pinned
`VITE_SCHEDULING_MODES` off were converted **before** the collapse, not stranded by it — the
ADR-0084 batch-1 lesson applied in advance.

### D9 — Levelled is a lens and a rendering, never an authority

ADR-0041 Q2 stands: the network float and criticality remain authoritative and the levelled
start/finish stay an additive overlay. The lens has **three** states derived from `level.ts`'s exit
paths, not two — "levelling is off for this plan" and "levelling ran and moved nothing" are
different facts, and a reader given one sentence for both cannot tell a switched-off feature from a
satisfied one.

### D10 — The programme's forward bound reads the placed span; the backward bound does not

A cross-plan interface is about where the upstream work is **planned to happen**, so the derivation
folds the predecessor's `visualEffectiveStart`/`visualEffectiveFinish` into the successor's external
instants, across **both** producers — the programme recalculation and ordinary single-plan
recalculation, which runs the derivation whenever the plan has an active cross-plan edge.

The **backward** direction is deliberately unchanged and is **not** the mirror of this. It reads the
downstream successor's computed **late** dates, because the latest a network tolerates is a
statement about float and a hand-placement is not an input to that question: there is no such thing
as a placed late finish.

`computeSchedule`'s arguments are assembled the same way and the pure engine still never sees a
cross-plan edge — the change is entirely in which persisted column feeds them.

### D11 — The migration log is org-scoped customer content with a Cascade FK and no retention window

`placement_migrations` is the only record that the strip happened, permanently: the activity PATCH
route is classified `PLAN_CONTENT` in the audit census and excluded from `audit_events` by design,
so nothing there will ever carry it. It therefore sits **outside `RETENTION_TABLES`** by decision —
asserted by equality in `retention-boundary.structural.spec.ts`, so this is written down rather than
omitted — and takes `ON DELETE CASCADE` on `plan_id`, which gives it the right lifecycle without
growing another hand-maintained sweep list.

`activityId` is a plain correlation id with **no** foreign key: the row must survive the activity
being deleted, which is when it is most wanted.

## Alternatives considered

- **Keep the mode and fix the drag** (write `visualStart` on an `EARLY` plan too). Rejected: it
  leaves two columns meaning "where the bar is" and every consumer still choosing between them, so
  the class of defect survives with a smaller blast radius and no way to tell which surfaces had
  been corrected.
- **Three peer ghosts** — earliest, latest and levelled drawn together. Put to the product owner and
  rejected in favour of one window plus one rival: three outlines on a dense programme is a picture
  of the machinery rather than of the plan.
- **A two-valued `date_basis` on the baseline** instead of a snapshot level. Rejected: a level can
  say "nobody looked", and a basis cannot — the distinction between an absent placement and an
  unrecorded one is exactly what a variance read needs.
- **Translate the placement into a constraint on export.** Rejected — see D7.
- **Strip every `SNET`, not four classes.** Rejected on the measurement: it destroys 706
  hand-placements on the epic's own 102,000-activity fixture, and it would place inert-constrained
  bars earlier than logic allows.
- **Run the strip from the application rather than a SQL migration.** Rejected: it needs the pen, a
  recalculation and an ordering decision per plan, and it would let the recorded set and the
  converted set differ.

## Consequences

- **A stale web bundle silently renders Early dates for placed plans until it refreshes**, and the
  response side is not symmetric with the request: a caller _sending_ `schedulingMode` gets a 422,
  and a bundle that no longer _receives_ it does not error on its absence — it defaulted to
  `'EARLY'`. ADR-0047 recreates the two images independently, so that window is real. It is recorded
  here rather than pretended away by a test that cannot see it.
- **The rollback from the schema drop is a restore, not a redeploy.** Once `plans.scheduling_mode`
  is gone the value is gone; redeploying the previous image gives a column that does not exist.
- **The strip is irreversible and permanently unauditable**, which is what `placement_migrations`
  and the planner-facing notice exist to answer. The compensating recipe in the migration's own
  comments has been run once, against the M-I schema, and nothing in the suite drives it.
- **The levelling parity argument changes** (ADR-0041 §7's Gate A / Gate B split), and Earned Value
  gains a per-component phasing model, because a placement shifts a span the levelling pass reads.
- **`remainingFloat` has no index**, and the reason CQ-1 originally gave for persisting it was
  false: the Gantt sorts in the browser and the activities list takes no sort parameter, so
  persisting buys no sorting anyone uses. It is persisted because it cannot be derived correctly on
  the client, which is the argument that survives.
- **The estate's day-one behaviour is knowable and was not measured.** FC-1's readings come from the
  ADR-0140 staff diagnostics on the deployed host and are the product owner's to take; the strip
  runs inside `prisma migrate deploy` at boot, so after release the pre-state is not reconstructible.
  Recorded as owed rather than estimated.
- **One diagnostic query's shape is now wrong for the estate this creates.** `baselines-over-placed-plans`
  joins, which is right today (the deployed host holds 164 activities) and reaches ADR-0140's 500 ms
  bar at high placement density. Its recorded escalation trigger measures the wrong quantity — every
  plan carries a placement at 1 % density, long before the crossover — and the quantity that decides
  is the (baselines × placed activities) product.

## References

- Spec, plan and falsification conditions: [`docs/specs/one-planning-surface/`](../specs/one-planning-surface/)
- Per-milestone records: `m-p/branches.md`, `m-c/placement-snapshot.md`, `m-d/upper-bound.md`,
  `m-e/window.md`, `m-f/collapse.md`, `m-i/premise.md`, `m-i/record.md`, `m0/measurements.md`
- ADR-0033 (the mode this amends), ADR-0041, ADR-0043, ADR-0045, ADR-0052, ADR-0054, ADR-0088,
  ADR-0126, ADR-0134, ADR-0140
