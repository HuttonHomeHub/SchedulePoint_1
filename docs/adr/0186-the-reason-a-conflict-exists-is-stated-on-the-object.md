# ADR-0186: The reason a conflict exists is stated on the object, and the toolbar chip stays a count

- **Status:** Accepted — 2026-10-11. The spec was approved by the product owner on 2026-10-10 (accessibility,
  UX and component reviews signed off); the product owner chose option B′ (a caption line above the selection
  bar's controls) on 2026-10-10 after M0 showed the inline read-out costs a line at 1912 × 1080.
- **Amended by:** ADR-0187 (2026-10-11) — the Consequences' first Tab stop is no longer Zoom to selection or
  Float paths: the selection bar leads with the activity's own actions.
- **Spec:** [`docs/specs/conflict-reason-on-object/feature-spec.md`](../specs/conflict-reason-on-object/feature-spec.md)
  · **Plan:** [`implementation-plan.md`](../specs/conflict-reason-on-object/implementation-plan.md)
  · **Readings:** [`m0-measurement.md`](../specs/conflict-reason-on-object/m0-measurement.md) (the inline
  probe, the stop rule), [`m1-measurement.md`](../specs/conflict-reason-on-object/m1-measurement.md) (the
  shipped caption)
- **Date:** 2026-10-11
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** ADR-0094 D5 ("one of them renders nothing"), which stays true of the remedy and stops being true
  of the conflict.
- **Builds on:** ADR-0093 (an object action belongs on the object), ADR-0132 (an event versus a standing
  condition), ADR-0082 (shade, never hide), ADR-0184 (a subject wraps, never clips), ADR-0105 (why this was a
  spec), ADR-0110 (a gate is verified against the defect it names), ADR-0113 and ADR-0142 (measure before
  building), ADR-0088 D1 (no flag; the rollback is the commit). ADR-0111 is not engaged: no shared primitive's
  keyboard contract changed.

## Context

Since the toolbar redesign's M4 (product owner, 2026-10-10) the deck's conflict chip says only "Conflict 2 of 7".
Its reason was unreadable at the 1024 floor, so it was dropped, and the reason was **spoken** (the polite
announcer, on every Next-conflict step) and **shown to nobody**. Measured on the tree before this work
(`m0-measurement.md` §2): after Next conflict the selection bar carries "Review the constraint…" for a constraint
conflict, and for a placement conflict only Clear visual start with a changed icon, with no sentence on any of
the four types. A planner who clicked a flagged bar, or used the Has-conflict filter, heard no reason for two of
the four types from the listbox either: `describeActivity` had a clause for the placement reasons and none for a
constraint or a levelling-window conflict, and used different words for the one it did have.

## Decision

1. **D1 — A flagged selection states every reason, in words, on a caption line above the selection bar's
   controls.** It shows however the planner arrived (Next conflict, a click, the filter, the Gantt), in the
   Diagram and the Gantt dock, and leaves with the selection or the conflict. It is derived by
   `matchingConflictFlags` — the derivation the count, the filter, the announcer and the remedy already read —
   so it cannot disagree with them. It sits on **its own line** so the controls below it never reflow; that is
   the whole reason it is not an item in the bar.
2. **D2 — One wording, one source, everywhere a reason is spoken or read.** `CONFLICT_FLAGS` labels are
   written to stand alone ("Constraint not met", "Placed before its logic allows", "Placed after its
   constraint", "Levelling window exceeded") and joined by `joinConflictReasons` (the first capital kept at the
   start of a line, lower-cased after words). The caption, the Next-conflict announcement, the canvas listbox
   option's conflict clause (`describeActivity`) and the Gantt row's `aria-description` all read them, so a
   screen-reader user hears what a sighted one reads. The remedy addresses the **leading** reason only.
3. **D3 — The caption is presentational, and the control that answers it carries the reason as its
   description.** No `tabindex`, `role`, `aria-live`, `data-toolbar-focusable` or truncation (a wrap, ADR-0184),
   and **not** `aria-hidden`: where no described control exists (no placement, a second flag behind a leading
   `barAction`) the visible text is the only channel, and browse-mode duplication where both exist is accepted.
   The route remedy takes `aria-describedby` to a hidden sibling node (never text inside the button, which would
   become its name); Clear visual start takes `srDescription` only when the remedy map names it. The bar stays one
   roving Tab stop (Zoom to selection in the Diagram, Float paths in the Gantt dock); the caption is never on it.
4. **D4 — The deck's chip stays count-only.** The reason lives on the object, not the toolbar (owner decision).
   This amends ADR-0094 D5: the `barAction` remedy still renders no twin; what it lacked was the sentence.
5. **D5 — A Gantt row-menu item needs an activation path.** `conflict-remedy` is a `render` item with no
   `onActivate`, so it listed as a live "Fix this conflict" that did nothing when chosen. The menu lists only
   items with `onActivate`; the remedy is on the docked bar.
6. **D6 — A conflict read-out has one look.** Foreground text and a warning-coloured icon, no fill, border or
   hover, so it cannot be read as a control: `features/plan-actions/conflict-readout.ts`, shared by the caption
   and the deck chip (the icon takes `CanvasText` in forced colours). The pair on the bar's composited card
   (`--foreground` at 5 % over the chrome background) is asserted in `token-contrast.test.ts`.

## Alternatives considered

- **A. The reason as an inline item on the bar.** Built first as a probe (M0). **Rejected on the numbers:** at
  1912 × 1080 fine it wraps the bar for constraint and for placed-before-logic (40.7 px and 62.8 px short), so
  the foot row goes 51 to 87 px and the canvas loses a row; at the 1024 floor it costs a line (40 px).
- **B. The reason on the deck chip or the toolbar.** Rejected by the owner (count-only), and unreadable at 1024.
- **C. A callout anchored to the bar on the canvas.** Rejected: it overlays the scene (the selection bar was
  taken off the scene for that, ADR-0064 and ADR-0080) and has no answer in the Gantt.
- **D. A toast per step.** Rejected: a conflict is a standing condition, not an event (ADR-0132); a clicked bar
  raises no toast, so it fails "however the planner arrived".
- **E. A conflict-review dock.** Rejected: it does not exist, and ADR-0094 D5 withdrew a second strip.
- **B′. A caption line above the controls.** **Chosen.**
- **Wait for `#471`** (give the outlet its own row when it holds a bar). Declined as a precondition: it is its own
  spec, and the caption's cost is bounded and small.

## Consequences

- **The cost is canvas height while a flagged activity is selected** (`m1-measurement.md`, 60 readings):
  20 px at every width on a fine pointer (16 px on touch); 16 px of foot-row growth at 1912 × 1080 on a one-line
  bar. The labels were shortened after the UX review so the reachable two-flag text fits one line at the 1024 floor. No control reflows, and nothing is clipped or unreachable.
  An unflagged selection is unchanged.
- **A 120 px stage floor broke on touch and was recovered.** The caption took the touch 1024 × 600 stage from 134
  to 114 px, under the floor `viewport-cluster.spec.ts` holds. `pointer-coarse:leading-4` on the caption and
  `pointer-coarse:py-0.5` on the foot row return it to 122 px. That breaks the foot row's "copies the deck's
  inset" rule on touch deliberately, and leaves **2 px of margin**, filed as `docs/TECH_DEBT.md` #488.
- **The announcer's wording changed**: "Conflict 2 of 7: Pour slab — constraint not met." The listbox option now
  speaks a conflict clause for all four types, and keeps the working-day count for an early placement.
- **The Tab order is stated, not assumed.** The first Tab stop is Zoom to selection in the Diagram and Float
  paths in the Gantt, and the remedy is reached by arrow keys. The spec's earlier claim that Tab lands on the
  remedy or on Logic was wrong and was corrected on measurement.
- **Known gaps, filed:** the remedy sits far from the reason on a wrapped bar (#485); the warning triangle repeats
  up to three times on one bar and the Gantt dock has a stray icon-only control (#486); a text-only 200 % zoom
  on touch 1024 × 600 clips the toolbar's tail, which predates this (#487); the 2 px margin (#488). The single
  organisation's clipped name has no keyboard route to its full text, as ADR-0104 accepts.
- **`docs/TECH_DEBT.md` #479 is closed by this record.**

## References

- `docs/TECH_DEBT.md` #479 (closed; see Closed numbers), #485 to #488 (the follow-ups), ADR-0094 D5, ADR-0093
- `apps/web/src/features/tsld/render/conflicts.ts`, `apps/web/src/features/plan-actions/selection-actions.tsx`,
  `apps/web/src/features/plan-actions/conflict-readout.ts`, `apps/web/src/features/tsld/render/a11y.ts`,
  `apps/web/src/features/gantt/components/GanttRowMenu.tsx`
- `apps/web/e2e-workspace-chrome/conflict-review.spec.ts`, `apps/web/e2e-gantt-editing/object-actions-reach.spec.ts`,
  `apps/web/e2e-workspace-fit/conflict-reason.spec.ts`, `apps/web/measure-toolbar/conflict-reason-m0.spec.ts`
  and `conflict-reason-m1.spec.ts`
