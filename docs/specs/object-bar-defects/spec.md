# Feature Spec: Three object-surface defects

> **Status:** approved by the product owner in conversation, 2026-08-27, from the analysis this
> document records. **Stage 1–2 were done in that exchange** — the problem was found by reading the
> code behind three observations from a released build, and each recommendation was accepted as
> written. This artefact exists because ADR-0105's trigger fired: US-2 adds a **new user-facing
> entry point** to the object bar, and that is the one case where "the change is small" is exactly
> the judgement the process says not to make yourself.
>
> **`feature-analyst` was not run**, and that is a departure worth stating rather than hiding. The
> discovery stage is already complete and its citations are below; re-deriving them would produce a
> second account of the same four files. If a reader disagrees, the check is cheap: every claim here
> names the file and line that established it.

## 1. Business understanding

### Problem

Three observations from `web-v0.108.1`, each of which turned out to be a defect rather than a
preference once the code was read:

1. **`Steps` is `Progress` with the focus one heading lower.** `activity-editor-intent.ts:85-88`
   maps `progress → { tab: 'progress' }` and `steps → { tab: 'progress', focusSteps: true }`, and
   `focusSteps` feeds exactly one prop — `autoFocusHeading` on the steps panel
   (`ActivityEditorDialog.tsx:877`). Same dialog, same tab, same permission, same subject. That is
   ADR-0093's discriminator failing inside one surface: two controls that differ only in scroll
   position. The file's own docblock says so — _"Progress and Steps share a tab… the only difference
   between the two entry points is where focus lands."_

   It is also the **only** item on that bar that _hides_ rather than shades without the pen
   (`selection-actions.tsx:568`, `isVisible: canEditSchedule && stepsEligible`), where `Edit`,
   `Duplicate` and `Delete` are `penGated: true` and shade with a reason (ADR-0082). So the control
   a planner sees appear and disappear is carrying two inconsistencies, not one.

2. **The Gantt has no route to an activity's notes at all.** `add-note` is hidden there
   deliberately (`tsld-toolbar-items.tsx:2649-2661`), on the stated ground that _"the object bar is
   docked in the Gantt with a correctly-labelled route"_. **There is no Notes item on the object
   bar** — all thirteen ids are listed at `selection-actions.tsx:469-769` and none is notes; `Logic`
   opens the **Logic** tab, and Notes has had a tab of its own since ADR-0062. `GanttRowMenu.tsx`
   adds only Indent / Outdent / Insert. So the reasoning that removed the control described a
   replacement that does not exist.

   Two comments are stale alongside it, both describing pre-ADR-0062 behaviour: `addNoteShape`'s
   `description` reads _"Opens the Logic panel (links & notes)"_ (`tsld-toolbar-items.tsx:1981`) and
   `use-tsld-toolbar-context.tsx:534-536` says it opens _"the Logic panel AND reveal + focus its
   Notes section"_. Neither is true — `revealActivityNotes` opens the Notes tab
   (`use-plan-workspace-model.ts:283-292`). The model's own comment beside it **is** current, which
   is why this drifted unnoticed: a reader who checked one of the three found it correct.

3. **The command deck renders two type scales on one row.** `Deck.tsx:459` forces the label span to
   `text-micro` — but only on the `ToolbarButton` branch. Every `render` item (each `▾` trigger)
   bypasses it and keeps `toolbarControlVariants`' `text-sm`. So `Go to today`, `Legend`,
   `Next conflict`, `Select`, `Arrange`, `Settings…` and `Comments` paint at 10 px beside `View ▾`,
   `Filter ▾`, `Add ▾`, `Link ▾`, `Summary ▾`, `Analysis ▾` and `Share & export ▾` at 14 px.

   This is verbatim the ADR-0110 D2 shape — one `if` with a side effect on presentation — and it was
   left **knowingly**: the comment at `Deck.tsx:453-457` says changing the type scale as well
   _"would make the shipped width unattributable to the number that justified the change"_. That was
   correct at the time. The geometry change has since shipped and been measured, so the reason has
   expired. **A deferral whose reason has lapsed reads exactly like one whose reason still holds** —
   ADR-0114 recorded that about `docs/TECH_DEBT.md` #124 nine days ago, and this is the same class.

### Users

Planners on the plan workspace, in both views. (2) additionally affects anyone who works primarily
in the Gantt, which is the view a planner shows the people they report to (ADR-0059).

### Expected outcomes

- One entry point per subject on the object surface.
- An activity's notes reachable from either view, by a control that says "notes".
- One type scale on the command deck.

### Success criteria

- `Steps` appears on neither the object bar nor the activities table row menu, and the Progress tab
  still opens with its steps panel present.
- A `Notes` item on the object bar opens the editor's Notes tab, in the Diagram **and** the Gantt.
- No command-surface item consults the selection **and** has an object-bar twin.
- Every label on the command deck resolves to the same size, asserted rather than looked at.

### Open questions

None outstanding. One consequence was surfaced to the product owner before building — see D2.

## 2. Functional requirements

### User stories & acceptance criteria

**US-1 — As a planner, I reach an activity's weighted steps without a second button that opens the
same tab.**

- `steps` is gone from `selectionActionItems` and from the activities table's row menu.
- Opening `Progress` from either surface still shows the weighted-steps panel.
- No route to steps is lost: the panel is on the tab both remaining entry points open.

**US-2 — As a planner in either view, I open an activity's notes from the object bar.**

- A `Notes` item sits on the object bar, present in Diagram and Gantt.
- It opens the editor's Notes tab (`openActivityEditor(activity, 'notes')`).
- It is **not** pen-gated (ADR-0046: notes are a Contributor action), and it shades with a reason
  when the caller cannot write notes.
- `add-note` is **removed from the command surface** — see D2 for why that is required rather than
  optional.

**US-3 — As a planner, the command deck reads as one row.**

- Every label in the deck resolves to one computed font size, whichever branch renders it.

### Edge cases

- **A `WBS_SUMMARY` selection.** Notes are polymorphic over activities (ADR-0046) and a summary is an
  activity row, so the item is present. No special case.
- **No selection.** The object bar does not render at all today
  (`TsldPanel.tsx:2597`), so there is nothing to shade. Unchanged by this work.
- **`VITE_NOTES` off.** The item is absent, matching `add-note`'s existing flag treatment — there is
  no notes surface to open.
- **The Gantt row menu** mirrors the docked bar's items (`GanttRowMenu.tsx:158`), so `Notes` arrives
  there for free and `Steps` leaves it for free. Neither needs its own change; both need asserting.

### Permissions

Unchanged. `Notes` inherits `canWriteNotes` — the same gate `add-note` carries today
(`tsld-toolbar-items.tsx:2664`) — and the same two-clause reason, role before selection.

## 3. Technical analysis

`apps/web` only. **The CPM engine is not imported, no migration runs, and no API contract changes**,
so the ADR-0034 recalculation parity gate is untouched by construction.

**Blast radius, counted rather than estimated.** `add-note` is referenced by 3 unit suites
(`tsld-toolbar-quick-wins{,-off,-notes-off}.test.tsx`) and 4 journey files (`e2e-authoring`,
`e2e-gantt-editing/object-actions`, `e2e-notes`, `e2e-support/toolbar.ts`). `e2e-notes` drives the
capability end to end and must follow the control to its new home — that suite is the acceptance
evidence for US-2, not a chore alongside it.

## 4. Solution design

### D1 — `Steps` is deleted, not shaded

The alternative — keep it and make it shade like its neighbours — fixes the inconsistency the
planner sees and leaves the duplication that caused it. ADR-0093's rule is about the relationship
between two controls, and the relationship here is that one is the other with a different scroll
offset.

`focusSteps` and the `'steps'` purpose **stay**. They are how the Progress tab knows to put focus on
the steps panel when a future entry point wants that, and deleting a mapping to remove a button is
a wider change than the defect needs.

### D2 — `Notes` moves to the object bar; it is not added beside `add-note`

This is the part that grew on reading, and it is stated plainly because the product owner approved
"add Notes to the object bar" and this is what that turns out to require.

`add-note`'s `isEnabled` consults `ctx.selectedActivity` (`tsld-toolbar-items.tsx:2662`). That is
**ADR-0093's discriminator verbatim**: an action whose subject is the selected object belongs on the
object's surface. That ADR enumerated four command-surface items that consult the selection and
noted only `Report progress` had a dock twin; adding `Notes` to the bar creates the second twin. So
the command-surface copy goes, exactly as `update-progress` did.

**The existing gate would not have caught it**, and that is worth recording.
`selection-duplication.structural.test.ts` compares **ids and labels** across the two registries —
`add-note` / "Add note" against `notes` / "Notes" collide on neither, so it would have stayed green
while the duplication existed. Its own docblock admits the limit (_"this test can only see what the
registries expose"_). The remedy is not to widen the comparison — a fuzzier match raises the chance
of blocking a future PR on a coincidental collision, which that file already narrowed once for
exactly this reason. It is a **pinned positive case** for notes, mirroring the one that exists for
`Progress`: the dock offers it, and nothing in the command surface does.

**What is gained and lost, stated:** Gantt gains a notes route it does not have. Diagram's route
moves from the deck to the object bar — same number of presses, on the surface that carries every
other action on that activity. A planner driving from the command surface loses a control there;
the object bar is one band lower and always renders with the selection that control required
anyway.

### D3 — One type scale, chosen deliberately

The two candidates are `text-micro` (what plain commands paint now) and `text-sm` (what every `▾`
trigger paints now, and what `toolbarControlVariants` declares).

**`text-sm`, by deleting the override rather than extending it.** The shared CVA is the primitive's
declared size; the override is one consumer contradicting it for a geometry that no longer exists.
Extending the override to the `render` branch would make the deck's type a local decision in a file
that no longer has a reason for one, and would need re-applying at every future `render` item.

**Its cost is width, and it must be measured before it ships, not after.** Labels get bigger; the
deck wraps rather than hides (ADR-0109 D1), so the risk is lines, not lost commands. The
falsification condition is written before the run: **if either deck row gains a line at 1920 or
1646, D3 is withdrawn and re-opened as a type-ramp decision** rather than shipped as a tidy-up.

### D4 — No feature flag

ADR-0088 D1: a `VITE_` constant is inlined at build time and has never been an operator rollback.
The rollback is a commit boundary, and each of the three is independently revertible.
