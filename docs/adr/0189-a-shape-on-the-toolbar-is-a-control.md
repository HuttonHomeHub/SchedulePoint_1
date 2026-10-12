# ADR-0189: A shape on the toolbar is a control

- **Status:** Accepted — 2026-10-12. The spec was approved by the product owner on 2026-10-12 ("approve, go with
  your recommendations": CQ-1 (a), CQ-2 (a), CQ-3 (a)); the shared column was withdrawn by the owner the same day
  after M0 (D6); the built toolbar was signed off the same day (Consequences).
- **Spec:** [`docs/specs/toolbar-grid/feature-spec.md`](../specs/toolbar-grid/feature-spec.md) · **Plan:**
  [`implementation-plan.md`](../specs/toolbar-grid/implementation-plan.md) · **Readings:**
  [`m0-measurement.md`](../specs/toolbar-grid/m0-measurement.md) (before) and
  [`m-final-measurement.md`](../specs/toolbar-grid/m-final-measurement.md) (after, with the photographs under
  `photos/`)
- **Date:** 2026-10-12
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** ADR-0185 D3 (Baseline overlay is no longer icon-only at every width) and D8 V1 (the row marks), V2
  (the group pill), V3 (the hollow, dashed Author outline) and V4 (the closing action's outline).
- **Builds on:** ADR-0119 (a group of buttons says which are alternatives), ADR-0133 (the pen leads and is the only
  amber slab), ADR-0118 and ADR-0183 (control heights, unchanged), ADR-0117 (an icon-only control names itself),
  ADR-0111 (the keyboard contract was reviewed), ADR-0097 (no new colour token) and ADR-0088 D1 (no flag; the
  rollback is the commit).

## Context

ADR-0185 and its visual brief left the command deck reading as boxes: a pill round every group, a mark at the head of
each row, a ring round Export and Share, a dashed outline on a locked Author group, and controls that are really one
unit (a choice of one, undo and redo) drawn as separate buttons. The owner's screenshot (`before-1912.png`) showed
five boxes at 1912 wide where the picture should show two rows. The rule this ADR states is that a shape on the
toolbar must mean something a control does: a box that groups nothing a user can act on is removed, and a shape that
does mean something (one choice, one joined unit) is drawn as exactly that.

Measured before any code (`m0-measurement.md`): the shared lead column the spec first asked for fits only at 2160 px
and wider (3 of 12 pointer-stage cells), and both of the owner's screens are 1912 wide.

## Decision

1. **D1: Groups are split by a full-height divider in the gap, never boxed.** Each row clips at its own left edge, so
   no divider starts a line; a trailing group that wraps alone draws its divider from an empty `aria-hidden` item
   before it. **Amends D8 V2** (the pill) and supersedes the pill's role in SC-12.
2. **D2: A choice of one is a recessed track with the chosen member raised; a joined unit shares a track.** The
   Colour set and Diagram | Gantt are switches; Undo, Redo and Recent edits (in that order) and the promoted Link
   "Type" set are joined. A track has no role, no name and no stop of its own; every member keeps its full control
   height (ADR-0118, ADR-0183). The raised member is a fill and an underline, never colour alone, and under forced
   colours takes `Highlight` / `HighlightText`. **Builds on ADR-0119** (D2 there is the all-or-nothing partition rule;
   this gives the segment a picture) and on `docs/TECH_DEBT.md` #154 (the flat pressed set).
3. **D3: An icon is one step quieter than its label; an icon alone is the label.** A glyph beside a visible word is
   `--muted-foreground` at rest and takes the label's ink when open, selected, armed or the pen. Scope: the band (the
   deck and the page header's two toolbars). The selection bar and the diagram-corner cluster keep their ink, filed
   as `docs/TECH_DEBT.md` #498.
4. **D4: Stray bits go.** The row marks are removed (**amends D8 V1**); the Export/Share ring is removed (**amends D8
   V4**); the locked Author group has no dashed outline, and the eleven shaded commands and the pen say so by their
   own state (**amends D8 V3**, CQ-2); the Baseline overlay shows its word, "Baseline", from 79 rem on a fine pointer
   (**amends D3**, and records the owner's 2026-10-12 reversal of 2026-10-10); the two milestone presets print
   "Start milestone" and "Finish milestone"; the search field's outline is the quieter `--chrome-input-quiet`, which
   still clears 3:1 (CQ-1 (a)).
5. **D5: Two placements are declared in the registry, and exist from 80 rem of window only.** `ruleBefore` draws a
   short inset rule before an item (or before its whole track), and `groupTail` sends Settings… to the end of the
   DO row. Below 80 rem each would cost a line at 1024 with Link armed, so the gear stays after Analysis and the
   rules are not drawn there. The owner chose this on 2026-10-12 after M0.
6. **D6: The shared lead column is withdrawn.** The two rows do not share a column; `leadColumn` and milestone M4 were
   not built. Recorded so a later reader does not look for it.

**Rejected:** clearer pills (option A, still five boxes); shaded tiles (option C, heaviest, contrast risk on dim
screens); a `ResizeObserver` column; CSS-only stage rules; a borderless search field (1.4.11); 30 px controls inside
tracks (they would break ADR-0118 and ADR-0183).

**Not amended:** ADR-0109 D1 (nothing is hidden), ADR-0133 (the pen leads and is the only amber slab), ADR-0118 and
ADR-0183 (heights).

## Consequences

- **Owner sign-off, 2026-10-12, verbatim,** given after seeing the after photographs including
  `before-after-1912-fine-pen.png`: "Signed off but minor tweaks required at some point". The tweaks were not
  specified and are not guessed at here; `docs/TECH_DEBT.md` #499 holds them until the owner names them.
- **A measured side effect the owner was told about before signing:** at 1912 on a fine pointer, Earned value moved
  from the bar into the Analysis menu, because the ladder's re-derived moves (M3) spend the width on Baseline's
  word. Nothing is removed (ADR-0109 D1); it is one press further.
- **Another, from `m-final-measurement.md` §0.2:** with the coarse pointer and Link armed, the DO row now wraps to two
  lines at 1280 (−26.6 px) and 1440 (−0.3 px), where it was one before. Link armed is a transient state the harness
  holds on purpose; it is recorded as measured, not as a verdict. Every unarmed state is one line per row on both
  pointers from 1280 up, and Link armed at 1024 fine is one DO line.
- **LOOK with a conflict is the tightest one-line state:** coarse 2.7 px free at 1280 and fine 12.6 px at 1600, above
  the harness's 2 px margin but not by much (`m-final-measurement.md` §0.3).
- **The promotion ladder moved** (fine only: L6 and P1 to P7 re-staged) and `promotion-widths.{fine,coarse}.json` were
  re-taken; the SC-18 journey in `e2e-promotion` holds the ladder to them.
- **The track wrappers sit inside the roving container** with no stop of their own, and the arrow walk's order changed
  for Undo, Redo and Recent edits. This is a shared primitive's keyboard contract (ADR-0111): the plan routed it to
  accessibility-reviewer and component-reviewer before release.
- **The CSS budget is 19.00 KiB** (it was 18.00) and the build reads 18.05 KiB.
- **Filed:** `docs/TECH_DEBT.md` #498 (quiet icons on the selection bar and corner cluster, threaded by prop) and
  #499 (the owner's unspecified tweaks).

## References

- `docs/specs/toolbar-grid/` (spec, plan, `m0-measurement.md`, `m-final-measurement.md`, `photos/`)
- `apps/web/src/components/ui/toolbar/toolbar-registry.ts` (`cluster`, `ruleBefore`, `groupTail`),
  `ClusterTrack.tsx`, `toolbar-styles.ts` (`TOOLBAR_TRACK`, `toolbarIconClass`)
- `apps/web/e2e-workspace-fit/command-surface.spec.ts`, `floor-states.spec.ts`, `deck-tracks-forced-colors.spec.ts`
- `docs/DESIGN_SYSTEM.md` (the toolbar section), `docs/UX_STANDARDS.md`, `docs/COMPONENT_LIBRARY.md`
