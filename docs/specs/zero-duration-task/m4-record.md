# M4 record: the resourced fact and Make milestone (#384)

What M4 of [the plan](./implementation-plan.md) built, and the runs that established it. Every
mutation below was applied to one file at a time from a copy, run, and restored from that copy.

## M4-T1: `resourceAssignmentCount` on activity responses

Every activity response carries `resourceAssignmentCount: number | null`. The number is the live
resource assignments of a **zero-duration task**, and `null` means "not counted for this row". FC-9
failed for the all-rows count: on a single-tenant 2,000-activity plan the planner seq-scans
`resource_assignments` for a 100-id list. So the count takes the spec's first remedy rung and asks
only the rows that need the answer; a page with none issues no query (`m0-measurement.md`, "M4-T1").
Assign and unassign invalidate the plan's activity list.

FC-10's three readers now agree on one fixture (`staff-diagnostics.e2e-spec.ts`): the activity
field, the health advisory and the staff diagnostic.

| Mutation                                                | Cases that went red                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `resource.deletedAt` dropped from `liveAssignmentWhere` | the FC-10 per-row map (`goneResource: 1`); with that assertion removed, the three-way comparison (field 3, advisory 3, diagnostic 2) |
| `r.deleted_at IS NULL` dropped from the diagnostic SQL  | the FC-10 comparison (diagnostic 3)                                                                                                  |
| `attachAssignmentCounts` returns `null` for every row   | the get and PATCH case (`expected null to be 2`)                                                                                     |

## M4-T2: one derivation, three surfaces

`deriveMakeMilestoneGate(activity, definitionGate)` is called by the selection-bar item (and so by
the Gantt row menu, which renders the same registry) and by the activities table's row menu. Both
hosts pass `model.activityEditorGating.general` by identity. The bar renders the item icon-only
(M0-T5: no labelled candidate keeps the foot row on one line at 1646), named by `aria-label` and an
ADR-0117 name tooltip; the menus render `MAKE_MILESTONE_LABEL` as text.

| Mutation                                                       | Cases that went red              |
| -------------------------------------------------------------- | -------------------------------- |
| Pen/role and resourced checks swapped                          | the precedence case              |
| The type clause dropped from the predicate                     | five omit cases                  |
| The table handed `{ ...gate }`                                 | the table identity case          |
| The table handed `{ writable: canEditSchedule, reason: null }` | the table identity case          |
| `definitionGate,` removed from `TsldPanel`'s builder input     | the host structural case         |
| The table spells the label as a literal                        | the label pin                    |
| `SelectionActionsBar`'s wrapper no longer calls `restoreFocus` | the focus-before-open order case |

The role-sentence row the plan asked for is `docs/TECH_DEBT.md` #397.

## M4-T3: the dialog, the write, undo and focus

`MakeMilestoneDialog` (`Dialog` + `RadioCardGroup` + `NoticeStrip`), mounted once by the workspace.
Confirm sends `PATCH {version, type}` through `beginLayoutEdit`, records one undo step whose inverse
sends `{ type: 'TASK' }`, and announces from the recalculated row after `autoRecalc.settled` moves.

| Mutation                                                    | Cases that went red                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Announce immediately on confirm                             | the announcer-order case                                                                   |
| `durationDays` added to the patch                           | the exact-write case                                                                       |
| Confirm on native `disabled`                                | the pending case                                                                           |
| The error `NoticeStrip` removed                             | the error case                                                                             |
| `closeMakeMilestone` clears the target (the unmount, below) | the model's close-keeps-target case; the Gantt journey (`Received: null`, focus on no row) |
| The tooltip placed below its trigger only (the flip, below) | the tooltip flip case                                                                      |

### Two product defects the journey found, and one harness defect

No unit suite could see either product defect: jsdom has no layout and no native focus return.

1. **A mouse click on the bar's Make milestone did nothing.** A mousedown focuses the button, and
   focus opens the ADR-0117 name tooltip immediately. `useTooltip` anchored the tip below its
   trigger, and the clamp alone pushed it back up **onto** a trigger at the viewport's bottom edge
   (the canvas dock). So the mouseup landed on the portalled tip, and the click went to the two
   targets' common ancestor, never the button. The journey showed focus still on the button with no
   dialog in the DOM and no console error. Every earlier icon-only `ToolbarButton` sat in the
   command deck at the top, so the defect was latent until this item. **Fix:** the tip flips above
   its trigger when it does not fit below (`tooltip.tsx`, `placeTip`), with a unit case verified
   red against the below-only placement. This is a change to a shared primitive's placement, not
   its keyboard contract; it is flagged for the gate pass.
2. **Cancel and a successful conversion both dropped focus to `<body>`** (WCAG 2.4.3). The host
   rendered the dialog only while a target was set, and closing cleared it, so the `<dialog>` was
   removed from the document while open. Only `close()` returns focus to the `showModal()`-time
   owner (`dialog.tsx:70-71`). **Fix:** the target outlives the open flag; the host keeps the
   dialog mounted with `open={model.makeMilestoneOpen}` and keys it per opening.
3. **Harness:** shrinking the viewport from 1920 to 1646 mid-test left Chromium with no hit-testing
   viewport. `document.elementsFromPoint` returned `[]` for a point inside 1646 × 1097, and every
   canvas click timed out behind "`<html>` intercepts pointer events" for four minutes. Growing
   from the config's 1646 to 1920 works, so the journey measures 1646 first.

### The journey (`e2e-workspace-chrome/zero-duration.spec.ts`, `e2e-gantt-editing/object-actions-reach.spec.ts`)

- **FC-6** is judged on an **unplaced** zero-duration task, against an ordinary unplaced task, at
  1646 and 1920: the foot row's height is equal. The journey's first version compared against the
  placed task and read 51 → 87 px at 1646. That wrap is `Clear visual start`'s, which M0-T5 measured
  and M-F-T6 accepted before this item existed.
- The bar item and the dialog's four controls are at least 24 × 24 and pointer-reachable at both
  widths (axe's `target-size` is off here, ADR-0090 M5).
- Cancel writes nothing and returns focus to the diagram listbox.
- Converting the placed task stores the placement one calendar day earlier (Monday 12 → Sunday 11),
  leaves the successor on Monday 12, returns focus to the listbox, and announces the recalculated
  date. Ctrl+Z restores the row byte-for-byte on the compared fields.
- A resourced zero-duration task shows the item shaded with the assignments reason.
- From the Gantt, the conversion returns focus to the activity's row. That case seeds through the
  API, so it calls `syncClient` first (TECH_DEBT #183); `recalculate()` presses nothing on a plan
  the client believes is current.

## Owed to the gate pass

The plan names **accessibility-reviewer** before merge for the dialog and the focus successor
(CLAUDE.md §19.13). It has not run; this session had no way to launch it. The tooltip placement
change above should go to **component-reviewer** with it.
