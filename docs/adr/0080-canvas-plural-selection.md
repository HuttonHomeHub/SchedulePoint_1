# ADR-0080 — The canvas plural selection, and what a bulk action owes its subject

- **Status:** Accepted (M0–M5 landed, `VITE_CANVAS_MULTI_SELECT` **default-on** 2026-08-08 — the
  flip followed the flag-on journey's first green run, not the other way round; see §9)
- **Date:** 2026-08-08
- **Supersedes:** nothing. **Amends:** ADR-0064 (a fifth tool mode), ADR-0031 (the floating
  per-object bar is replaced, not joined, above one selected).
- **Spec:** [`docs/specs/canvas-multi-select/`](../specs/canvas-multi-select/)

## Context

Every plan-shaping gesture on the TSLD acted on exactly one bar. A planner re-sequencing a phase —
twelve activities that all move a fortnight — did it twelve times, and the twelfth was as likely to
be dropped a day out as the first. The table had learnt this already (ADR-0063 M4b's bulk assign);
the canvas, which is the surface this product exists to be, had not.

**The CPM engine is not imported and the ADR-0034 recalculation parity gate is untouched.** Nothing
here changes what `computeSchedule` is given or what it returns; it changes how many rows one
gesture writes.

## Decisions

### 1. A selection is a set **with a primary**, and the primary is the most recently added survivor

Several things the canvas already does are singular by nature and stay that way: the edge handles
resize one bar, the activity panel shows one record, `aria-activedescendant` names one option.
Modelling the selection as "the set, plus which member is the subject" keeps those consumers honest
— they read `primaryId` and get exactly what they got before — instead of each inventing its own
rule for which member of a set it means.

The primary is **never an index**. An index into a set that shrinks is a bug waiting for the right
delete; "the last one you touched that is still here" is a rule a planner can predict without being
told it.

`reconcile` is **derived, never an effect** (the ADR-0063 M4b rule): an id that leaves the plan
leaves the selection at read time, so no effect can race a delete and no render can briefly show a
selection of something that is gone.

### 2. The flag is **derived**, because `Shift` was already taken

`CANVAS_MULTI_SELECT_ENABLED = CANVAS_DIRECT_MANIPULATION_ENABLED && flagDefaultOn(…)` (it read
`flagDefaultOff` until the M5 flip). `Shift` is
the legacy link chord (start-to-start), so a build with the plural selection on and direct
manipulation off would give one modifier two meanings. Deriving the flag makes that overlap
**structurally impossible** rather than avoided by care.

### 3. **Selecting is a read**, and that decides more than it looks like it does

The marquee tool is not pen-gated: a Viewer may sweep a rectangle to see what is in it, and a
writer who has not taken the lock may too. Three consequences followed, none of them in the plan:

- the canvas's Escape branch that returns a tool to `select` is gated on `editing`, so the marquee
  needed an **ungated** one — otherwise the tool arms for a reader and traps them in it;
- the pointer-transparent **interaction canvas** mounts without the pen, or the sweep is invisible
  to exactly the person with no other feedback;
- the write-busy refusal does not apply — an in-flight save is no reason to refuse a read.

Each of those is one line. Together they are the difference between a tool and a dead end, and none
of them would have been noticed by reading the plan.

### 4. One intersection predicate, one span order

`idsIntersecting` is the **only** rectangle-overlap function in the feature, shared by the marquee
sweep and the shift-click span and pinned by a structural test that scans for hand-written AABB
arithmetic. This is the ADR-0065 `routeOrthogonal` argument: two implementations would drift, and
the drift would be invisible — each looks right alone, and only a planner who selected the same set
two ways would ever see one is wrong.

A span is in **plan order, not screen order**. A span defined by screen position would change with
the zoom, so the same two clicks would select different work at a different scale.

### 5. `Space` toggles; the logic summary moves to `i`

The APG binding for a multi-selectable listbox, and the one a planner arriving from any other list
will press. Recorded in `docs/DECISIONS.md` because it is a **rebinding**, which is the change least
visible in a diff: both bindings do something, so nothing looks broken from either side.

Its consequence is that the keyboard cursor becomes **separate state**. Space toggles the focused
row _without moving focus_, and until this epic the focused row and the selection were the same
thing — so toggling the primary off would have teleported the cursor to whichever row was added
last. `Shift+Arrow` extends **vertically only**, because `Shift+←/→` is the ADR-0052 duration nudge
and taking it would have removed a shipped edit accelerator to add a navigation one nobody asked
for.

`Escape` is the **last rung**: tool → open pick → selection. Both handlers see the same keystroke,
so the ordering is guards rather than hope — clearing the selection unconditionally would take a
planner's tool _and_ their selection with one press, which is the ADR-0064 defect arriving through a
door that decision did not have.

### 6. A bulk delete's undo is **one id-stable restore**, not N re-creates (CQ-4)

The single-activity fallback is re-create-with-a-new-id, which loses every link the activity had.
For a plural delete that also loses the links **between** the deleted activities — so a planner who
removed a phase and pressed undo would get their bars back with the logic gone, silently, with
nothing on screen saying so. `POST …/activities/restore-batch/:batchId` puts the ids back, so the
links come with them. The batch id is re-threaded on every redo, because a redo is a new batch.

### 7. A chain is ordered by **time**, previewed, and cycle-checked against the resulting graph

ADR-0064 was opened on a report that a link had been recorded the wrong way round. A wrong single
link is one right-click to fix; a wrong chain of twelve is a programme that reads backwards. So:

- **time, not pick order** — a marquee expresses no sequence, and honouring which bar the rectangle
  touched first produces a chain that reads as random. Total order (date → name → id), so the same
  selection cannot chain differently on a different day.
- **previewed before any write**, with a Reverse that flips the whole sequence rather than offering
  a second ordering rule.
- **the cycle check runs over the resulting graph.** A→B and B→C are each individually legal
  against a plan holding C→A; together they close a loop. Edge-by-edge checking passes them and
  then fails mid-loop, leaving a partial chain — which is worse than none, because the plan then
  looks finished.

Capped at 50 links, **refused with the number** rather than truncated.

### 8. Complete-row batches, and separate endpoints for layout and time

`PATCH …/activities/placements` takes complete rows: every field required-but-nullable via
`@ValidateIf`, never `@IsOptional()`. An omitted field is a validation error, never a silent
destructive default — which is what stops a bulk lane drag from quietly unpinning twelve
constraints.

It is deliberately **separate** from `PATCH …/positions`: lane is layout and needs no
recalculation, a placement feeds the engine. One endpoint doing both would take the wider
invalidation for every lane drag in the product.

## Consequences

- The floating per-object bar is **replaced** above one selected, not joined. Per-object actions
  (Edit, Open logic) have no meaning for twelve bars, so they are **absent** rather than shaded, and
  the bulk bar names the primary instead.
- An EARLY-mode bulk move pins an `SNET` on every selected activity. At twelve that stops being a
  side effect and becomes a plan-shaping decision, so the bar states it **before** the drag.
- The interaction canvas now mounts for read-only viewers flag-on (§3). The flag-**off** parity
  suites cannot see that by construction, so the cost was **read out of the loop** rather than
  asserted: `TsldCanvas.tsx:1330-1331` takes the overlay context and then returns unless
  `interactionDirtyRef.current` is set, and nothing sets it without a gesture — so a viewer who
  never sweeps pays one extra `<canvas>` element and one **cached** `getContext('2d')` per frame,
  and zero drawing calls. That is why the mount is unconditional rather than state-dependent: a
  mount that came and went would remount a canvas mid-session and lose its sizing, which is the
  defect `TsldCanvas.tsx:1192` already documents.

### 9. The flag-on journey is the enablement gate, and it earned that for the fourth epic running

`apps/web/e2e-multi-select/` (its own CI step) drives the whole gesture against a **real API with
the pen enforced**, through the canvas's parallel listbox rather than its pixels. It found **four
defects on its first runs, none of them visible to any unit suite**, and the flag was flipped only
once it was green:

1. **The bulk bar was unreachable in the shipped app.** `bulk` was wired into
   `plan-workspace.tsx` and not into `plan-workspace-toolbar.tsx` — which is the layout
   `VITE_CANVAS_TOOLBAR` selects, i.e. the one every planner gets. Every unit suite passed, because
   each mounts the panel and hands it the prop directly. The ADR-0064 §7 shape exactly: one correct
   pattern applied to a host and not its neighbour.
2. **A bulk delete dropped focus to `<body>`, so Ctrl+Z reached nothing.** A native `<dialog>`
   returns focus to whatever had it before `showModal()`, from inside the effect that closes it —
   _after_ the handler that asked for the listbox. The element it returned to (the bar's Delete
   button) had itself unmounted with the selection. That is a WCAG 2.4.3 failure on its own, and it
   also silently disables undo, because the accelerators are a React `onKeyDown` on the workspace
   root. jsdom has no modal focus restoration to lose the race to, so no unit test could see it.
3. **The deletion announcement was overwritten by the focus it needed.** Focusing the listbox fires
   its default-select, which announces the row it lands on — so "2 activities deleted." was spoken
   and immediately replaced by a bar description. The confirmation is now announced _inside_ the
   focus frame, which makes the ordering the code's rather than the scheduler's.
4. **Reverse was sticky across previews.** `chainReversed` is panel state and nothing reset it on
   open, so cancelling a reversed preview left the next chain already flipped with nothing on
   screen saying so — the ADR-0064 report (a link recorded the wrong way round) reappearing as a
   state nobody set.

**The specialist-agent review pass this epic's predecessors all ran was not run here**, and the flip
went ahead without it — on the journey, the flag-off parity suites, the counting-stub draw budget
and the full pre-push gate. That is a gap rather than a judgement that the pass was unnecessary, and
it is `docs/TECH_DEBT.md` **#107**, which says what the remaining gates do and do not cover.

Two of the journey's own assumptions were also wrong and both corrections improved it: the fixture
needed **distinct start dates**, because five unconstrained activities all start at the data date
and the chain then orders **alphabetically** — a correct behaviour that would have made the
direction assertion test the alphabet; and the undo assertion needed a **15 s** poll, because one
undo is a restore, a recalculation and a refetch, and the 5 s default expired mid-chain while the
row was already live in the database (checked in `psql` rather than assumed).

## Recorded corrections

Two of this epic's own plan claims were wrong, both found by checking rather than by failing:

1. **M2-T4 specified a split-button on a `Select` toolbar item.** There is no `Select` item on that
   toolbar and never has been — Select is the mode you are in when no tool is armed. Building the
   specified shape would have meant inventing a control whose primary region's only job is "stop
   doing the thing you are not doing". It ships as a plain toggle carrying the full ADR-0064
   arm/disarm contract.
2. **M2-T5 cited `use-tsld-toolbar-context.tsx:435-441` as the export scene.** Those lines are
   `isAddingActivity`. The export scene is `export/render-export-image.ts`, and no caller passes a
   selection at all — so "no ring in an export" is **structural**, and the assertion the plan asked
   for was not needed.

A spot-check of five decision-bearing citations in the plan found two stale. That rate is the
ADR-0076 Class 2/3 failure inside a document written for this epic, and it is why the remaining
milestones were built by verifying each citation before relying on it.

## Alternatives rejected

- **A `Set` for the selection.** Free iteration order, and it loses "most recently added" — which is
  the whole primary rule.
- **Screen-order spans.** Reads naturally until the planner zooms.
- **Coalescing bulk moves in the undo stack.** Merging two would produce an undo that restores the
  union of two different selections — a state nobody was ever in, reached by pressing undo once.
- **Re-create as the bulk-delete inverse.** §6.
- **Edge-by-edge cycle checking.** §7.
