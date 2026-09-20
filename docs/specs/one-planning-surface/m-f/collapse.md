# M-F — the collapse

**Status:** Approved

The record of deleting the `EARLY`/`VISUAL` split. Written per task as it lands, because the
milestone's largest risk is a claim about what the collapse does NOT touch.

---

## T1/T2 — the read path

### What actually changed

`barDateSourceFor(mode, lateOverlay)` became `barDateSourceFor(lateOverlay)`, returning
`lateOverlay ? 'late' : 'visual'`. Two call sites dropped an argument. That is the whole of it on
the read side.

**Dropping the parameter rather than ignoring it is the decision.** A caller still holding a
`schedulingMode` would be asking a question the product has stopped having an answer to; the
compiler removes the question, instead of every caller separately agreeing to stop asking.

### The claim the milestone is most likely to be wrong about, checked

> "Early mode is Pass 1, so deleting the mode means deleting Pass 1."

**False, and checkable in one command.** `grep -rn "schedulingMode" apps/api/src/modules/schedule/engine/` returns **nothing**: `computeSchedule`
has never taken a scheduling mode, and `compute.ts`'s results loop writes `visualEffectiveStart` /
`visualEffectiveFinish` for **every activity of every plan**, unconditionally, beside the early and
late pairs. So:

- **The engine is untouched by M-F.** Not "carefully preserved" — untouched. There is no mode input
  to remove.
- **Pass 1 is not the "Early mode" pass.** It is the float, the criticality, the Late dates, the
  drift a placement is measured against, every DCMA metric and the whole ADR-0034 conformance
  matrix. All of it still runs on every recalculation.
- What collapsed is **which of two already-computed columns a BAR is drawn from**.

### What moves on screen, and for whom

On an activity nobody has placed, `visualEffectiveStart === earlyStart`, so the great majority of
the estate draws in identical pixels. The population that moves is exactly the one the
`placement-on-early-plan` diagnostic (D-D2) was built to size: a bar carrying a placement made
while its plan was `VISUAL`, on a plan later switched back to `EARLY`, which renders at its early
dates today and will render where it was placed. That diagnostic exists precisely so this is a
number an operator can take rather than a surprise.

### No flag gate, deliberately

The collapse is unconditional. Gating it on `SCHEDULING_MODES_ENABLED` would buy nothing an
operator can use — ADR-0088 D1 established that a `VITE_` constant is inlined at build time and
every published image carries the default, so it is not a rollback — while maintaining a second
product whose bars sit somewhere else. The rollback is a commit boundary.

The same edit unified a second reading: `barDateSource` read the raw `viewToggles.lateOverlay`
while the print path beside it read the hoisted `lateOverlayActive`. The two agreed by accident
while this resolved to `'early'` whenever the flag was off; post-collapse they would not.

## The finding: the rule had no test, and the whole suite proved it

**686 test files passed, unedited, through a change that re-points every bar in the product.**

`barDateSourceFor` had **no direct test at all**. Six suites `vi.mock` it to `() => 'early'`, which
pins the mock and says nothing about the rule; nothing else called it but the product. So the
function collapsed from two branches to one and the entire web suite could not tell the difference.

A green suite that cannot distinguish a change from its absence is this register's most-filed
shape, and the honest response is a test rather than relief. `lib/bar-dates.test.ts` now covers the
rule, with three mutations verified red:

| #   | mutation                                       | result           |
| --- | ---------------------------------------------- | ---------------- |
| P1  | the collapse reverted (`'visual'` → `'early'`) | **1 failed** / 5 |
| P2  | the Late overlay loses precedence              | **1 failed** / 5 |
| P3  | `'visual'` falls back to the early columns     | **1 failed** / 5 |

Its fixture carries **three distinct date pairs** on purpose: with two sources sharing values, a
resolver returning the wrong one passes, which is how a rule about which column to read comes to be
tested by a case that cannot see the difference.

**The six mocks were corrected in the same pass.** Left at `'early'` they would describe a world no
shipped bundle can produce — the shape ADR-0088 records the base journey's six editing specs having
been in for months, where a suite proves something true of nothing that ships. They still mock
rather than call the real resolver, because those suites are about the host; the rule has its own
file now.

---

## T3 — the write path

### One rule where there were two

Every gesture that moves or places work now writes `visualStart` and **nothing else**. Four sites
carried the branch and all four lose it: the canvas **draw**, the single-bar **reposition**, the
start-edge **resize**, and the plural **bulk move** (through `bulkMoveSnapshots`). The `CloneMode`
on copy/paste goes with them.

**What the `EARLY` half actually did is worth stating, because it reads as a small deletion and is
not.** A move on an `EARLY` plan sent a **full-definition PATCH** imposing an SNET at the dropped
day, which by design **overwrote whatever constraint the row carried** — so dragging a bar silently
replaced a commitment somebody had recorded on purpose, and a bulk drag replaced twelve. To avoid
clearing everything else it had to round-trip fifteen definition fields, each of which this file
records having been forgotten once (the duration type, the exact minutes, the EV inputs, the
accrual type). The minimal placement PATCH carries none of that risk because it touches one column.

So the collapse **removes a write** rather than redirecting one, and the surviving guarantee is
stronger than the one it replaces: a move cannot disturb a constraint at all.

`repositionCommand`, `minorToMajorInput` and `CloneMode` became unreachable and are deleted; `tsc`
found all three.

### The near-miss: an `else` that was doing two jobs

Removing `isVisualMode` from `if (startDay !== undefined && isVisualMode)` makes the `if` read as
"start-edge" — and its `else` then looks like dead EARLY-mode code. **It is not.** That branch was
shared: it handled the EARLY start-edge drag _and_ the **finish-edge** resize, distinguished inside
itself by a spread on `startDay !== undefined`. Deleting it made every finish-edge drag a silent
no-op.

Caught by `tsc` reporting five newly-unused imports and by reading the diff — **not by a test**. The
resize suites mock the mutation, so a dropped call reads as "no write", and a no-op resize asserts
nothing. The general shape is now a comment at the site: **an `else` that survives a collapsed
condition is not automatically the branch that was collapsed.**

### A false claim found in a passing test

`use-plan-workspace-model.move-many.test.ts` carried a case titled _"writes visualStart and CLEARS
the constraint in VISUAL mode"_, with a docblock explaining that clearing is "the load-bearing
half" because a stale SNET would pin a bar invisibly.

**The code never did that.** `movedPlacement` spreads the row's current placement, so
`constraintType` arrives at whatever the row already had. The case passes because the fixture's
constraint is **already `null`** — it has never been able to tell "carried through" from "cleared",
and it was written after a first version guessed `undefined`, went red, and was corrected to the
right value for the wrong reason.

The hazard it described is real; the reassurance was false. What the product guarantees is the
opposite and better — a move does not touch a commitment — and that is now asserted in
`bulk-move.test.ts` against a fixture carrying an **FNET**, chosen because the old pinning rule
could never have produced one, so a version that still wrote a constraint must clobber it and fail.

### The suites: converted, not silenced

Seven assertions across four files went red, every one of them describing the deleted write. The
two `EARLY` cases in `bulk-move.test.ts` and the start-edge `EARLY` case in the resize suite are
**deleted** rather than rewritten, with their surviving subject named at the deletion site — in
each case an inversion of what they used to say:

| was                                                   | now                                         |
| ----------------------------------------------------- | ------------------------------------------- |
| "the visualStart seam is never touched in EARLY mode" | the definition seam is never touched at all |
| "EARLY pins an SNET and VISUAL does not"              | a move writes a placement and pins nothing  |

Two mock defects were fixed with them, and both would have made a case green about nothing: a
`useSetActivityVisualStart` stubbed as an **anonymous** `vi.fn()` (so a suite asserting the
reposition seam was asserting against a mutation nothing tracked), and a 409 case rejecting
`updateMutateAsync` — the seam a start-edge drag no longer uses, so the mock would have resolved
happily and the conflict path under test would never have been entered.

---

## T6 — `clear-visual-placement`, and the typed date

### The action applies to every plan now

`clearVisualPlacementApplies` was exactly `schedulingMode === 'VISUAL'`. ADR-0115 used it to
**omit** the control outside Visual mode rather than shade it — ADR-0082's discriminator, since an
Early plan had no hand-placed start to refuse clearing, and the control was holding 146 px of a row
that wraps to say so. Every plan can hold a placement now, so it applies always; the predicate, its
`schedulingMode` input and the `clearPlacementApplies` prop threaded through four files are deleted
rather than left defaulting to `true`, which would be a lever with no caller (the ADR-0101 #156
shape).

**Its 146 px come back to the selection bar unconditionally, and that is a real cost** on a row five
epics have spent fitting. The tempting refinement — omit when the SELECTED activity carries no
`visualStart` — is rejected at the site rather than left unconsidered: it would make the bar's
contents change as the selection moves, which ADR-0094 refused for its own remedy, and it is a new
behaviour rather than a consequence of the collapse.

The gate's ladder goes from four rungs to three, and its precedence case is **rewritten rather than
dropped**: what that case pinned is that the ladder is ordered at all, which survives the loss of
its permanent rung.

### ADR-0134 D2 goes with it

A typed `Start` in the Gantt grid pinned an `SNET` in Early mode and hand-placed in Visual
(ADR-0134 D1/D2). The `SNET` branch is deleted, so a typed start and a dragged start now mean one
thing — which is what ADR-0134 D1 asked of them in the first place: _"a typed date writes the
constraint a drag writes."_ D2 was right for its world (a computed start can only be moved honestly
by pinning it) and a placement column makes it unnecessary rather than wrong.

D3 is **untouched and still the branch a reader expects to be `FNLT`**: a typed finish writes a
duration and no constraint, exactly as a finish-edge drag does.

`schedulingMode` leaves `CellWriteContext`, `useGanttGridEditing`'s props and the workspace
toolbar's local — the last of which existed only because the same ternary had been written out four
times and a component review flagged it. The narrowing was correct; it is gone because the question
is.

Its `it.each` over the two modes becomes an `it.each` over the two **date sources**, which is a
weaker sweep and is labelled as one: `'early'` is now reachable there only through an analysis
surface rather than a plan setting, and the case is kept because the two sources still read
different columns.

---

## T4 — the contract, and what the task list missed

`schedulingMode` leaves `CreatePlanDto`, `UpdatePlanDto`, `PlanResponseDto`, `PlanPatch`,
`PLAN_GOVERNANCE_FIELDS`, `packages/types` (`SchedulingMode`, `PlanSummary.schedulingMode`,
`ScheduleHealthReport.schedulingMode`) and the health read-model's `HealthPlanInput`.

**`schema.prisma` keeps `scheduling_mode` and `enum SchedulingMode` until M-J**, which the task's
own risk note demanded: a datamodel without a field the database still has makes
`prisma migrate diff --exit-code` exit 2.

### Four things the task list did not name, found by running rather than by reading

1. **`PlanScheduleSettings` does not contain the field and never did.** The task names it among the
   five places to edit; it renders `totalFloatMode` and nothing else (`grep -cin mode` → twelve
   hits, all `TotalFloatMode`). A plan's list of places is a claim like any other.
2. **`plan-health-check.dto.ts` and `health/compute-health.ts`** carry it as pure provenance — the
   report printed "Early scheduling" beside the data date. Not in the list; named in the wake-up
   note that carried this task, which is where it was first caught.
3. **The seed catalogue posts it.** `seed-http/runner.ts` sent `schedulingMode` on plan create, so
   T4 would have made the whole catalogue 422. It is removed from `seedPlanOptionsSchema`, the
   defaults, `SEED_SCHEDULING_MODES`, the API's `seed-vocabulary.spec.ts` pairing, and the
   **pairwise dimension table** — the last necessarily, because `pairwise.spec.ts` asserts every
   dimension has more than one reachable value, and a one-value dimension would have failed loudly
   rather than shrinking the covering array quietly. That gate did its job.
4. **Two API e2e fixtures.** `audit-coverage.e2e-spec.ts` resent `schedulingMode` unchanged beside a
   changed field, which is how it proves the governance producer diffs by VALUE rather than by
   presence; it now resends `totalFloatMode`, the nearest sibling the settings dialog also resends.
   And `staff-diagnostics.e2e-spec.ts` built D-D2's negative witness by PATCHing a plan to `VISUAL`
   — the one state the API can no longer be asked for. It writes the column with Prisma now, with
   the departure from this suite's "through the public REST API throughout" rule stated in place:
   **D-D2 exists to size a population the product can no longer create**, so it is tested against
   legacy-shaped rows or against nothing.

### The response side is not symmetric, and no test can see it

A stale **bundle** does not error on the field's absence — `plan-workspace-toolbar.tsx` defaulted it
to `'EARLY'` — so a web image recreated before the API one renders placed plans at their **early
dates** until it refreshes. ADR-0047 recreates `web` and `api` independently, so the window is real.
It goes in the ADR's consequences; the e2e case says in its own docblock that it deliberately does
not assert it.

---

## T4b — the four mode tests, converted

Measured in M-B-T1 clause 5 and correct: two break outright (`grid-edit.spec.ts:480`,
`bar-drag.spec.ts:157` — the only callers of each file's private `useVisualMode`), and two become
**wrong** (`grid-edit.spec.ts:437`, `bar-drag.spec.ts:138`) by asserting EARLY behaviour the epic
replaces. Each pair collapses into **one** test keeping the half that mattered — _and NO
constraint_ — which is the only end-to-end proof that the collapse did not leave the SNET write in
place behind the placement. Both helpers are deleted rather than pointed elsewhere.

**A fifth test was in scope and the measurement did not find it**, because the count was of helper
callers and this one calls nothing: `object-actions-reach.spec.ts` asserted `Clear visual start` is
**ABSENT** on an Early plan. T6 makes it present, so that case breaks **loudly** — an absence that
became a presence — and is inverted rather than deleted, with its pinned positive kept (ADR-0093: a
`toHaveCount(0)` passes equally if the bar never rendered). Recorded rather than smoothed over: a
count of callers cannot find fallout that reaches the condition another way, and a test run can.

### `e2e-workspace-chrome` loses its own `useVisualMode`, and one journey loses its subject

Three suites simply drop the line (`placement`, `conflict-review`, `placement-overlays`): every plan
they create is a planning surface now, so the setup is gone rather than missing — said in
`support.ts` so the next reader is not looking for it.

**`peer-unmount-focus.spec.ts` needed a new mechanism, and finding one is the finding.** It is
ADR-0135's only end-to-end instrument, and its whole case was a peer flipping `schedulingMode` while
the reader held the pen — reachable precisely because `PATCH …/plans/:planId` is not pen-gated.
After the collapse **there is no plan-level field a peer can write that removes a registry item**,
which was established by enumerating every `isVisible` in both registries rather than assumed. So
the fixture inverts: the **peer** holds the pen and retypes the selected activity to `WBS_SUMMARY`,
and the reader — holding no pen, because an activity write asserts `assertHoldsPen` and the two
cannot both be true — is standing on `Duplicate` (`isVisible: !ctx.isSummary`). Same hook, same
three guards, one control disappearing from under a focus ring because somebody else wrote. Guard 2
counts **activity** reads rather than plan reads, because the subject moved from a plan field to an
activity field and counting the old one would count a request that says nothing about it.

It also depends on `Duplicate` being **focusable while shaded**, which is ADR-0082's ruling: a
primitive that skipped `aria-disabled` items would make the reason unreachable by keyboard _and_
make this case impossible to construct.

**`measure-toolbar/tech-debt-204c-mode-flip-focus.spec.ts` is deleted** rather than converted. It
was #204(c)'s M0 evidence and its entire mechanism was the mode flip; converting it would have made
it produce a **different** reading from the one `docs/specs/unmount-focus-handoff/` records, and a
measurement file that no longer reproduces its own recorded measurement is worse than none. Its two
registered dependency citations (`@tanstack/query-core`'s `focusManager.js:11-13` and `:56-59`) move
to the journey, where the wake mechanism is still load-bearing — `check:claims` green afterwards.

---

## T5 — the flag, and the three things it was NOT gating

`VITE_SCHEDULING_MODES` is removed: the declaration, the `vite-env.d.ts` entry, every
`SCHEDULING_MODES_ENABLED` reference and ~26 test mocks of it. The register entry moves to
`retired` with the reason, and **that reason is not ADR-0088's**: this flag was class B with a
`keep`, i.e. never scheduled to fall. What changed is that the capability it gated no longer
exists, so a guard with nothing left to guard is dead config rather than a rollback contract.

Deleted with it: the `mode-early` / `mode-visual` registry items, `schedulingMode` /
`setSchedulingMode` on `TsldToolbarContext`, `useSetPlanSchedulingMode`, the Summary popover's
**Mode** row, and `clearPlacementApplies` — a boolean whose only falsifying condition was "the plan
is scheduled Early".

**Three things it also gated are ungated rather than deleted, and that is the load-bearing half:**

| kept                           | why it was never about the mode                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| the **Late-start overlay**     | reads the LATE dates; never consulted `schedulingMode`                                          |
| the **Visual conflict** legend | keys a mark every plan can now paint — withdrawing it would leave the commonest cue unexplained |
| **Go-to-date**'s caret         | display-only; the flag-off arm rendered **no** caret at all                                     |

Each carried `SCHEDULING_MODES_ENABLED` only because ADR-0033 shipped them in the same milestone.
Following the flag would have taken three working capabilities away as collateral.

The ADR-0119 `segment` partition still holds: `scheduling-mode` and `view-mode` were the two
segments of the `mode` row, and removing one leaves `view-mode` alone — the one-segment case that
ADR gate already covers, with the all-or-nothing precondition intact.

### A gate said no for a reason that was not a fact

Retiring the flag made `check:flags` refuse:

```
VITE_SCHEDULING_MODES is retired, but apps/web/playwright.gantt-editing.config.ts pins it OFF
```

That config pins **no** flag, and says so two lines above the sentence the gate matched: its
docblock spelled out the pin it had deliberately _not_ inherited, and assertion 4 scans these files
as raw text. Fifth recorded instance in this repository of a scan matching prose that describes its
own subject. The docblock is reworded (the literal was incidental) and the blind spot is filed as
`docs/TECH_DEBT.md` **#354** with a named remedy, rather than fixed here — `check-flags.mjs` is a
shared gate, and ADR-0105 makes that a full-spec trigger that ADR-0136 records being violated once
already.
