# ADR-0108 — A modal guards the canvas and nothing else

- **Status:** Accepted (M0–M5 landed 2026-08-23)
- **Date:** 2026-08-23
- **Supersedes:** nothing. **Amends:** nothing. ADR-0060 (per-scope save), ADR-0101 (an editor is a
  dialog) and ADR-0028 (the edit-lock) are load-bearing context rather than subjects.
- **Spec:** [`docs/specs/unsaved-work-guard/`](../specs/unsaved-work-guard/) —
  [feature spec](../specs/unsaved-work-guard/feature-spec.md),
  [plan](../specs/unsaved-work-guard/implementation-plan.md),
  [architecture](../specs/unsaved-work-guard/architecture.md),
  [M0 measurements](../specs/unsaved-work-guard/m0-measurement.md).
- **Register rows:** closes the second half of `docs/TECH_DEBT.md` #63.

## Context

`apps/web` had **no `beforeunload` handler and no router blocker anywhere** — zero matches for
`beforeunload`, `useBlocker` or any blocking primitive. A planner with unsaved activity edits could
reload, close the tab or navigate away and lose them with no prompt and no record.

The backlog had carried this for months with a justification that had **gone stale**: it said the
Graphite context drawer made it easier to hit, because a drawer does not block the canvas behind it.
ADR-0101 had reversed that two days earlier — the editor returned to `modalShell`, and
`registerDrawerSubject` has zero production callers (`docs/TECH_DEBT.md` #156). The gap was real; the
stated reason for it was not, and was corrected before any code was written.

## D1 — What "unsaved work" is: a report of scopes, not a boolean

ADR-0060 saves per **write scope**, not per dialog: definition edits need the ADR-0028 pen, progress
edits deliberately do not, and steps joined the pen side. So `isDirty` is the wrong shape — it cannot
name what is at risk, and cannot separate work that could still be saved from work that cannot.

The unit is `{ key, label, savable }`. `savable` carries the product owner's decision on the pen being
taken mid-edit (below), and it is the one place the two design passes had to be merged: one proposed
exactly this, the other `{ label, subject }`, with no way to express it.

## D2 — The editor was already lying about its own contents

`dirtyScopeNames` named **three** scopes — General, Scheduling, Cost — and the editor holds **six**:
`ReportedProgressPanel`, `ValueMeasurePanel` and `WeightedStepsPanel` each own a form.
`requestClose` returns `onClose()` outright when that array is empty, so a planner who edited a
weighted step and pressed Escape lost it **in silence**. That is `docs/TECH_DEBT.md` #63's second
half, and it was a live defect before this epic added a single new capability.

The three panels now report dirtiness upward and the editor composes one report. The `cost`
condition on `gating.cost.readable` is preserved exactly — a role that cannot read cost has no Cost
tab, and naming a tab the reader cannot see is worse than saying nothing.

## D3 — One blocker, both channels, and the trap that would have shipped it broken

`useBlocker` registers through `history.block()`, and `@tanstack/history` attaches its
`beforeunload` listener **once at history creation**, fed by the same blocker array. So in-app
navigation and browser exit are already one mechanism; adding our own `window` listener would be a
second opinion that drifts.

**The trap, measured at M0 and read from the installed source** (`dist/esm/index.js:247-257`):

```js
const shouldHaveBeforeUnload = blocker.enableBeforeUnload ?? true;
if (shouldHaveBeforeUnload === true) { shouldBlock = true; break; }
```

The unload path **never calls `shouldBlockFn`**. Registered with the default, this prompts the
browser's "Leave site?" dialog on **every reload of every page**, including a page with nothing
unsaved — while the in-app half behaves perfectly and every unit test stays green. The function form
is not a refinement; it is the only correct usage, and a test pins that it is a function.

Both callbacks must also be **referentially stable**: they sit in the registering effect's dependency
array, so inline arrows re-register the blocker on every render. Verified — inline arrows produce
**6 registrations against 1** across five renders.

## D4 — Registration tokens are minted by the hook, never supplied by the caller

A caller-supplied key means two mounts of one component share an entry, and the first to unmount
deletes the survivor's registration — a guard that silently stops guarding. `useId()` inside the hook
removes the possibility. Both naive designs were verified red, and against **different** tests: a
whole-map clear fails two cases, a caller-supplied key fails **only** the same-component-twice case.

## D5 — Pen lost mid-edit: warn anyway

Product-owner decision. When the ADR-0028 lock is taken while scopes are dirty, the work is unsaved
**and unsavable** — no button on screen would persist it. The guard still confirms, with copy saying
so. The rejected alternative (let them go silently, since nothing can be done) loses the work with no
acknowledgement it existed, which reads as the application discarding an edit rather than the lock
being taken.

## D6 — Scope: four surfaces, and the one that could not report itself

Product-owner decision, informed by a measured inventory: **25 components, 32 RHF instances, 13
dialogs**, and exactly **one** holding user input outside react-hook-form.

That one is `CalendarFormDialog`. Its seven-day working week lives in `useState` deliberately (the
rows are text a planner is mid-way through typing, and RHF's model would have to be taught that `8:`
is a legitimate intermediate state), so `formState.isDirty` is **structurally blind to it** — a
planner can rewrite every day's hours and the form reports itself clean. It registers on an explicit
value comparison against the week captured at open, pinned by its own test and verified red against
registering on `isDirty` alone, which is exactly the refactor a later reader would think reasonable.

`ActivityCreateDialog` had no guard of any kind — around twenty fields across four scope forms.
Unlike the editor, creation is one act with one permission (ADR-0089 D3), so every scope there is
savable.

## D7 — What a modal actually guards, stated because the backlog implied otherwise

The activity editor is a modal `<dialog>`: it sits in the browser's **top layer** and intercepts
clicks on everything behind it. An in-app link is therefore unreachable while it is open — for a
test **or** a planner. Established by reading a failing journey's page snapshot, not inferred.

So the guard's value for the editor is **reload, tab close and browser navigation**, not in-app
links. That is narrower than the backlog implied, and it is the whole of the exposure that existed.

**One channel is unresolved and recorded rather than claimed:** a `page.goBack()` does not reach the
blocker in this application. Instrumented — `shouldBlockFn` was **never called**, while the guard was
mounted and the URL never changed, so the pop was reverted by something other than this guard. The
reload channel is proven end to end; Back is not, and this ADR does not claim it.

## D8 — Coverage is a census with a pinned positive case

A hand-kept list of four registrants is the shape `docs/TECH_DEBT.md` #178, #181 and #183 keep
recording: a rule that goes **quiet** rather than wrong. Every form surface is therefore either
registered or carries a written exclusion, and a new one fails the gate until somebody decides which.

**The gate caught itself on its first run**, which is the most useful thing in this section. Its
"nothing is unclassified" assertion passed perfectly — because the glob matched **zero files**
(a brace pattern plus the wrong working directory), so there was nothing to be unclassified. The
**pinned positive case** is what failed. That is the ADR-0093 lesson — a green suite that cannot
distinguish "everything is classified" from "the census found nothing" — landing on this epic's own
gate, and it is why the positive case is asserted first and deliberately.

## Consequences

- Four surfaces register; roughly 27 other form instances are **classified and unregistered**, so
  adding one later is an addition rather than a redesign.
- `WeightedStepsPanel` uses `useFieldArray`, where a `move()` re-keys rows and marks the form dirty
  even if the order is restored. Accepted: a false positive costs one dialog. Recorded, not fixed.
- No `VITE_` flag (ADR-0088 D1: a build-time constant is not an operator rollback, and this adds no
  alternative surface). The rollback is a commit boundary.
- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
  is untouched — in its honest form: there is nothing here to hold parity for.
