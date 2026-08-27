# Implementation Plan: Three object-surface defects

Spec: [`spec.md`](spec.md). One epic, three milestones, each independently revertible and each its
own commit. **M2 is the only one with a surface**; M1 and M3 are removals.

## Sequencing

**M1 → M3 → M2.** The two removals go first because they are small, self-contained and cannot fail
in a way that blocks the third. M2 is last because it moves a capability between surfaces and its
acceptance evidence is a journey, which is the slowest thing here.

M3 carries a **falsification condition that can withdraw it** (spec D3), so it must be measured
before M2 builds on the same file — otherwise a withdrawal would land on top of unrelated work.

---

## M1 — `Steps` leaves both object surfaces

**M1-T1 — Delete the `steps` item** from `selectionActionItems` (`selection-actions.tsx:561-573`)
and the `Steps` row action from `ActivitiesTable.tsx`. Leave `focusSteps`, the `'steps'`
`ActivityEditorPurpose` and its mapping alone (spec D1).

**M1-T2 — The regression tests.** A case asserting the Progress tab still renders the weighted-steps
panel, so a green suite cannot mean the capability left with the button (the ADR-0093 pinned-positive
rule). Verified red by deleting the panel, not by deleting the item.

**M1-T3 — Sweep the suites.** `grep` for `Steps` across unit and journey files; any locator that
opened the editor through it moves to `Progress`. Expect `e2e-activity-editor`.

_Complexity: S. Risk: a suite reaching the steps panel only through this button — which is why T3 is
a sweep and not a spot-check._

---

## M3 — One type scale on the deck

**M3-T1 — Measure first, with the condition already written.** Record both deck rows' line counts at
1920 and 1646 **before** the change, using the existing vertical-stack harness. This is the third
epic running on this surface whose width expectation was contradicted by measuring it, so the number
comes before the edit.

**M3-T2 — Delete the `text-micro` override** at `Deck.tsx:459`, keeping `min-w-*`. Rewrite the
comment above it rather than removing it: it records a measurement that decided a previous change,
and its reason expiring is the finding, not noise.

**M3-T3 — Re-measure.** **If either row gains a line at 1920 or 1646, revert T2 and stop** — spec D3
says that outcome re-opens this as a type-ramp decision rather than shipping it.

**M3-T4 — A gate for the invariant, not the value.** Assert every deck label resolves to the same
computed size, across both branches — so a future `render` item cannot reintroduce the split. It
must be **verified red against the pre-T2 code**, or it is a test of nothing (ADR-0110 D5).

_Complexity: S, with a real chance of withdrawal. Risk: the measurement contradicts the change, which
is the point of taking it._

---

## M2 — `Notes` moves to the object bar

**M2-T1 — Add the `notes` item** to `selectionActionItems`: `group: 'object'`, ordered beside
`Logic`, `NOTES_ENABLED`-gated, **not** pen-gated, `isEnabled: canWriteNotes`, and the existing
two-clause reason with the role before the selection. It calls `openActivityEditor(activity,
'notes')`.

**M2-T2 — Remove `add-note` from the command surface** (`tsld-toolbar-items.tsx`), including its
shape, its Gantt exclusion and the placeholder branch. Spec D2 — this is required, not optional: the
item consults the selection, so leaving both creates the duplication ADR-0093 exists to remove.

**M2-T3 — Correct the two stale comments** (`addNoteShape.description`,
`use-tsld-toolbar-context.tsx:534-536`). Both describe pre-ADR-0062 behaviour. Correct in place with
what changed, per this repo's convention — a comment that recorded a defect is not deleted.

**M2-T4 — The pinned positive case.** Extend `selection-duplication.structural.test.ts` with a notes
case mirroring the `Progress` one: the dock offers it, and nothing in the command surface does.
Record in that file **why the general assertion could not have caught this** (different id, different
label) so the next reader does not over-trust it.

**M2-T5 — Repair the estate.** 3 unit suites (`tsld-toolbar-quick-wins{,-off,-notes-off}`) and 4
journey files (`e2e-authoring`, `e2e-gantt-editing/object-actions`, `e2e-notes`,
`e2e-support/toolbar.ts`). Counted from `grep`, not estimated.

**M2-T6 — The journey is the acceptance evidence** (ADR-0081). `e2e-notes` follows the control to the
object bar, and gains the case that does not exist today: **reaching an activity's notes from the
Gantt**, which is the defect. A unit suite cannot stand in — it would mount a registry, and the thing
that was wrong was which surface carried the item in which view.

_Complexity: M. Risk: `e2e-notes` is the only end-to-end proof of the capability, so a locator change
there that is wrong in the same direction as the code change would hide a regression. Mitigation:
assert the tab that opens, not just that a dialog opened._

---

## Definition of Done (per milestone)

- `pnpm prepush` green.
- Every new assertion **verified red** against the specific defect it guards.
- Journeys run locally for any suite touched — `scripts/e2e-local.sh web:<suite>`, one per call.
- Comments corrected in place where a reason expired, not deleted.
- A changeset per user-visible milestone (M1 and M2; M3 is presentation and takes one too, since a
  planner sees it).

## Risks & assumptions (rollup)

- **M3 may be withdrawn by its own measurement.** That is a designed outcome, not a failure.
- **M2 removes a control a planner may have in their fingers.** It moves one band down, on the
  surface carrying every other action for that activity. Recorded in the changeset in those terms
  rather than as an unqualified win.
- **No ADR is planned.** These are three defect fixes applying rules already accepted
  (ADR-0093, ADR-0082, ADR-0110 D2). If M3's measurement forces a type-ramp decision, that decision
  earns an ADR and this plan does not pre-empt it.
