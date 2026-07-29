# ADR-0062 — Activity-editor convergence: Logic, Resources and Notes as tabs

- **Status:** Accepted
- **Date:** 2026-07-29
- **Supersedes:** nothing
- **Amends:** ADR-0060 (the editor's tab set and entry points, not its save model),
  ADR-0032 M5 (the add-a-link surface)
- **Builds on:** ADR-0021 (the DAG), ADR-0028 (the pen), ADR-0039 (resource assignments),
  ADR-0046 (notes are not pen-gated), ADR-0048 (undo/redo), ADR-0060, ADR-0061 (form layout)

## Context

ADR-0060 made one activity one editor — four tabs, per-scope save — and then left two of that
activity's surfaces outside it. The row menu offered **Edit**, **Report progress**, **Steps**,
**Logic** and **Resources**: the first three opened the editor, the last two opened separate modal
dialogs. So "everything about this activity" was an editor plus two pop-outs reached from the same
menu, and moving between an activity's duration and its predecessors meant closing one modal and
opening another.

The Logic dialog was the worse of the two, because it contained a **third** level: its two "Add …"
buttons opened `AddDependencyDialog` — a modal on top of a modal, to do the thing the Logic surface
exists for. Notes were a section three panels down inside that same dialog, which is why the
toolbar's **Add note** had to open the Logic dialog and then scroll and focus its way down.

The question this ADR answers is not "should these be tabs" — that much was obvious once the tabbed
editor existed. It is **what has to be true for them to become tabs without changing what anyone is
allowed to do**, given that the surfaces being folded in carry three different write rules.

## Decision

### 1. The panels are extracted, not reimplemented

`DependencyEditor` and `ActivityResourcesDialog` each become a thin `Dialog` around a new
**panel** component — `ActivityLogicPanel` and `ActivityResourcesPanel` — that owns the whole
surface, including its own add/edit/remove dialogs. The tab renders the _same component_ the dialog
renders.

This is the load-bearing structural call. The alternative — a tab that reimplements the surface —
guarantees the two drift, and the drift is invisible: both look right in isolation, and only a
reader who opens the same activity two ways ever sees that one of them is a version behind. The
proof that the extraction was faithful is that **every pre-existing suite passed unchanged** through
the extraction commit; each later test change is a real behaviour change with a reason beside it.

A panel is mounted by a host that may not be showing it, so it takes `enabled` and holds its queries
back rather than hard-coding "open". A tab that fetches every activity's predecessors on the way past
General is a performance defect the dialog could not have had.

### 2. Adding a link becomes an inline section, not a third modal

`AddDependencyDialog` is deleted. Its form lands **below the two tables** as `AddLinkSection`, the
list/manage archetype `docs/DESIGN_SYSTEM.md` already prescribes and the Resources surface already
followed. Direction — which was carried by _which button you pressed_ — becomes a field whose options
say what each choice means in the same words as the tables' empty states, rather than assuming the
reader translates "predecessor".

The new row appearing in the table above the form is also better feedback than a dialog closing over
it. This amends ADR-0032 M5, which specified the two-click canvas link tool and left this dialog
alone.

### 3. Nothing about permissions changes — and that is checkable, not asserted

The Logic and Resources scopes **reuse the existing `definition` gate object** in
`deriveActivityEditorGating` rather than re-expressing the same rule:

```ts
logic: definition,
resources: definition,
```

An identity test pins it (`gating.logic === gating.general`). Adding a link needed the role and the
pen from the dialog and needs exactly the same from the tab; the server is untouched and remains the
only trust boundary. Notes join on the **progress** rule instead, because ADR-0046 deliberately does
not pen-gate them: a Contributor may annotate a plan while a Planner holds the pen.

That split is why per-scope save (ADR-0060) had to exist before this epic could. A single merged
Save would have to pick one of three rules.

### 4. The flag is derived, not read beside its parent

`ACTIVITY_EDITOR_CONVERGENCE_ENABLED` is `ACTIVITY_EDITOR_TABS_ENABLED && flagDefaultOn(…)` — the
`flagDefaultOn` half is the M6 flip; the `&&` is the decision.

There is no such thing as a Logic _tab_ without the tabbed editor to hold it: with tabs off and
convergence on, the row menu's Logic and Resources items would build an editor intent for a dialog
that never renders — both entry points stranded on a surface that opens nothing. Deriving the
constant makes that combination unrepresentable rather than merely untested. The Resources tab
additionally needs `VITE_RESOURCES`, and all four combinations of those two have their own matrix
test, because a surface reachable when its entry point is hidden is the exact defect the ADR-0060
security review found on the steps panel.

### 5. Tab order follows the subject, not the build order

**General → Scheduling → Logic → Resources → Progress → Cost → Notes**: what the activity is, what
it depends on, what does the work, how it is going, what it costs, what people said. Resources sits
with the other pen-gated definition scopes, before the status divide — the first draft appended it
after Cost, which is the order the milestones landed in rather than the order a planner thinks in.

### 6. Undo covers a link **add**, because it already covered a remove

ADR-0048's stack recorded a dependency remove and not an add, which was defensible while adding
meant opening a second dialog. Inline, the two sit in one section, and "the link you just deleted
comes back, the link you just added does not" is a worse inconsistency than the one it replaces.
`AddLinkSection` gains an `onAdded` seam mirroring `onRemoved`; the composition root passes the
recording function, so neither feature imports the other sideways.

## Consequences

- **Frontend-only.** No schema, DTO, permission or engine change; nothing reaches
  `computeSchedule`, so the ADR-0034 recalc parity gate is structurally untouched.
- **The dialogs stay.** Flag-off, every entry point opens what it opens today — the rollback
  contract, pinned by dedicated flag-off parity suites (kept, not weakened). Note that flag-off is
  **not** byte-for-byte the pre-epic surface: the inline add form (§2) landed unflagged, early and
  deliberately, so it soaks in the dialog before it is the only way to add a link.
- **`ScopeSaveBar` moved to `components/ui/`.** Its eighth caller is in another feature, and leaving
  it in `features/activities` would have had two feature barrels importing each other.
- **The Resources panel now answers to the cost-read gate** (`canReadCost`), so a role that cannot
  see the Cost tab does not see money on an assignment row either. Latent today
  (`canReadCost === canWrite`, TECH_DEBT #62) and load-bearing the day those role sets diverge.

## What the gates found

Four specialist reviews ran over the combined M0–M5 diff before the flip, and the flip is a separate
decision from the build for this reason:

- **The Resources tab hid its assign form** for anyone who could not write it, rather than shading it
  with the reason. Raised independently by the ux and component reviewers; it contradicts the house
  rule, the spec, and `ScopeGate`'s own docblock. A Planner who had simply not taken the pen met a
  tab whose form had vanished, with a padlock on the rail as the only explanation — the lit-but-inert
  dead end inverted, which is no better. Folded: `writeReason` mirrors the Logic panel's
  `manageLogicReason`, and the section's Save is now the shared `ScopeSaveBar`.
- **Tab order** was build order (§5). Folded, with the order assertion updated.
- **The steps panel never passed `saved`** to its save bar, so a successful "Save steps" left the
  helper text blank and the button grey — pixel-identical to a panel nobody had touched. That panel
  turned out to have **no unit coverage at all**: the suite named for steps covers the legacy dialog,
  which has its own Save button, so the editor's panel was invisible from it. Folded, with the
  missing suite added.
- **The flag pair could be set to a stranded combination** (§4). Folded by derivation.
- The accessibility review found **no blocking failure** and four nits, recorded as TECH_DEBT
  #64 (widened), #66, #67 and #68 rather than rushed; the component review's second finding is #69.

A flag-on Playwright journey (`apps/web/e2e-activity-editor/`, its own CI step) proves the three
claims that only a real API can: a link is refused without the pen (423) while progress is not, a
cycle is refused by the engine rather than the client, and a definition edit plus a link close with
no discard prompt — because a link is durable the moment it is added.
