# Diagram keys and selection, M5: the two selection bars and the jump

- **Date:** 2026-11-12. **Tree:** the `keys-work` branch after M1, M2, M4 and M3 (web 1.3.0 plus those four changes).
- **Spec and plan:** [`feature-spec.md`](./feature-spec.md) §4.8, [`implementation-plan.md`](./implementation-plan.md) (M5).
- **Harness:** one throwaway file, `apps/web/measure-toolbar/diagram-keys-m5.spec.ts`, run by the existing
  `playwright.measure-toolbar.config.ts` (`scripts/e2e-local.sh measure:toolbar -- diagram-keys-m5.spec.ts`). A harness,
  not a gate (ADR-0081 §3): it asserts nothing about a pixel, nothing under `apps/web/src` changed, no new config.
  Raw readings: [`readings/diagram-keys-m5.json`](./readings/diagram-keys-m5.json). Screenshots, one per state and size
  (device scale factor 2, palette-reduced to keep them small): [`readings/m5-<size>-<state>.png`](./readings/).
- **Real, not injected.** Real sign-up, a real Contributor invited and accepted through the Members screen, real API on a
  real Postgres, real Chromium, mouse through Playwright. The plan is twelve plain tasks, one per lane, no links.
- **What this does NOT cover, plainly.** Only Chromium. Only a plain task: no swimlanes, no code types, no conflict, no
  summary, so the bar shows **eleven** controls here, not the **fifteen** or so it can show (the roster at
  `selection-actions.tsx:743-1255`); the worst case is unmeasured. Fine pointer and the browser's default text size only:
  the 200 % text, coarse-pointer and 1920 × 1080 sweeps in spec §4.8 were **not** taken. Candidate shapes below were **not
  built** in the probe: their figures are inferences from the readings and are marked as such.

## Summary, in plain English

Selecting one activity at 1024 × 600 puts the actions on **four lines** and the foot row grows from 51 px to 167 px, so the
diagram drops from 362 px to 246 px. The jump is real and its cause is established: it is **not** the page scrolling, and
it is **not** the canvas shrinking by itself. It is the canvas's own "keep the selected bar in view" pan, which fires
because the shrunken diagram no longer has room for a bar that was low in it. A bar high in the diagram never moves. The
bar is never lost (it is always still visible afterwards), but at 1024 × 600 and 1280 × 720 a low bar slides up by about
130 px, and at 1366 × 768 and above by 12 px.

The number of lines is the whole cost, and it is linear: **4 lines cost +116 px, 3 cost +76, 2 cost +36**, so the first
line is free (it shares the foot row that is already there) and each further line costs about 38 px. The bar is only about
350 px wide at 1024 because the plan facts (data date, finish, activities, the Editing badge) sit beside it, which is why
eleven controls need four lines. The plural bar is a different shape (a long sentence, a drag hint, three buttons) and costs
+122 px at 1024 × 600.

## Readings

All figures are CSS pixels. "Foot" is the diagram's bottom row (`[data-activities-bar]`); "diagram" is the scene canvas.
"Lines" is the number of distinct rows the bar's controls sit on. The "low bar" is the deepest lane that fits wholly inside
the diagram with nothing selected, clicked with the mouse; "moved" is how far the reveal pan moved it.

| Size       | State                | Foot idle → selected | Diagram idle → selected | Lines | Controls | Low bar moved | Clipped / sideways scroll |
| ---------- | -------------------- | -------------------- | ----------------------- | ----- | -------- | ------------- | ------------------------- |
| 1024 × 600 | (a) one, pen         | 51 → 167             | 362 → 246               | 4     | 11       | 132 up        | none / none               |
| 1024 × 600 | (b) one, no pen      | 51 → 167             | 362 → 246               | 4     | 11       | 132 up        | none / none               |
| 1024 × 600 | (c) one, Contributor | 51 → 167             | 362 → 246               | 4     | 11       | 132 up        | none / none               |
| 1024 × 600 | (d) three, pen       | 51 → 173             | 362 → 240               | 2     | 3        | not read      | none / none               |
| 1280 × 720 | (a)                  | 51 → 127             | 482 → 406               | 3     | 11       | 128 up        | none / none               |
| 1280 × 720 | (b), (c)             | 51 → 127             | 482 → 406               | 3     | 11       | 128 up        | none / none               |
| 1280 × 720 | (d)                  | 51 → 121             | 482 → 412               | 1     | 3        | not read      | none / none               |
| 1366 × 768 | (a), (b), (c)        | 51 → 87              | 530 → 494               | 2     | 11       | 12 up         | none / none               |
| 1366 × 768 | (d)                  | 51 → 133             | 530 → 448               | 2     | 3        | not read      | none / none               |
| 1440 × 900 | (a), (b), (c)        | 51 → 87              | 662 → 626               | 2     | 11       | 12 up         | none / none               |
| 1440 × 900 | (d)                  | 51 → 133             | 662 → 580               | 2     | 3        | not read      | none / none               |

- **Which actions.** Single bar, all three readers, in order: Logic, Notes, Progress, Resources, Edit, Duplicate, Delete,
  Zoom to selection, Isolate logic path (and its options), Float paths. Without the pen, and as a Contributor, **Edit,
  Duplicate and Delete are shaded** and the rest are lit, so (b) and (c) are the same bar here. The Contributor's one
  difference from a Planner without the pen is the editor route, not the bar. Plural bar: "Link in sequence…", "Delete",
  "Clear selection", with a one-sentence subject message and, with the pen, the drag hint; Move and Set code are absent
  because this plan has no swimlanes or codes.
- **Plural bar's height is its text, not its buttons.** At 1024 × 600 it is one `NoticeStrip` of 122 px: the sentence
  ("3 activities selected — “Task 03” is the subject of single-activity actions."), the drag hint and three buttons.
- **Nothing was clipped or pressed out of the window** in any state, and neither the page nor `<main>` scrolled
  (`mainScrollable` 0 in every reading, `main.scrollTop` 0 before and after).
- **Control: a bar high in the diagram does not move.** From a fresh view, lane 0's bar read y 64 before and y 64 after, at
  all four sizes and all three single-bar states.

## The jump: which cause

The plan listed three candidates. The readings separate them.

| Candidate                                           | Reading                                                                                                                                                                                                                                         | Verdict                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| H3: the shell's `<main>` scrolls                    | `main.scrollTop` 0 → 0, `main` has nothing to scroll (`scrollHeight − clientHeight` 0), the canvas's top edge did not move (shift 0), the window did not scroll.                                                                                | **Rejected**                   |
| H1: the canvas shrinks under a fixed top-left point | The canvas does shrink (362 → 246 at 600), top edge fixed. But a bar near the top (lane 0) stayed at y 64 at every size, so shrinking alone moves nothing that is still inside the smaller diagram.                                             | **Real, but only the trigger** |
| H2: a reveal pans the selected bar into view        | The low bar read y 304 before and **172** after at 1024 × 600 (its old y was below the new 246 px diagram, so it would have vanished), 424 → 296 at 720, 484 → 472 and 604 → 592 at 768 and 900. Found by a hit-test sweep: visible every time. | **The cause**                  |

The code that does it is the selection-reveal effect at `TsldCanvas.tsx:1603-1666`: on a selection change, and again when
the stage settles (`stageTick`), it pans the **minimum** distance that puts the selected bar inside the visible stage
**with a margin of `LANE_HEIGHT` (60 px)**. A bar within 60 px of the new bottom edge is panned even though it is still
fully visible, which is the 12 px move at 768 and 900; a bar below the new bottom edge is panned in, which is the 130 px
move at 600 and 720. The code's comment says the effect is "a no-op when it's already visible (so pointer selection
doesn't jump)": the 60 px margin makes that false for the strip the dock takes. That is the established cause; the dock's
height decides how large the move is, not whether there is one.

Not measured: what the view does when the selection is cleared (the diagram returns to its full height; the readings show
`canvasHeightAfterEscape` equal to the idle height, but the bar's position afterwards was not re-read, and the code has no
step that undoes the pan).

## Candidate shapes for the single-selection bar on a short window (704 px high or less)

Which windows count: the `short` breakpoint is 704 px, so of the sizes read only **1024 × 600 is short**. 1280 × 720 is
not short, yet shows three lines and a 128 px jump; M6 should say whether that is intended.

The line cost above is the basis for every estimate below: **a one-line bar costs 0 px, two lines +36, three +76, four +116**
(inferred from the 4, 3 and 2-line readings; a one-line bar was not read, so "0" is an extrapolation of a straight line
through three points).

### S-A: primary actions, and a "More" menu (spec S1)

- **Out front, always:** the conflict remedy when the activity has one, Logic, Progress, Edit, Delete.
- **Under More, and why:** Notes (read/annotate, and Notes also opens from the editor's tab); Resources (an editor tab);
  Duplicate and Duplicate band (Ctrl+C then Ctrl+V works again since M1); Make milestone, Dissolve, Move to swimlane, Set code (occasional structural edits, each with a
  confirm or a panel of its own); Follow logic (when it is not the leading remedy); Zoom to selection and Isolate logic
  path and Float paths (view and analysis commands, not edits of the activity).
  The four kept out front are the ones a planner needs on every activity: open its logic, report progress, edit, delete.
- **Costs:** a single line, so about **0 px** (estimate): the diagram would not shrink at all and the jump would go with
  it. But it is an overflow, which the owner removed in the summer ("we need all commands visible when we can",
  `Toolbar.tsx:161-172`). It needs a `Toolbar` public-contract change (a declared short-window place per item), ADR-0219,
  component- and accessibility-review (ADR-0111), and focus rules for a command that moves under More while the reader
  is on it (ADR-0185 D4).
- **Keeps:** the bar on one line, every command reachable in two presses.

### S-B: give the bar the whole row on a short window, no overflow

- **What changes:** on a short window the plan facts (data date, finish, activity count, the Editing badge) leave the foot
  row while an activity is selected, so the bar can use the full foot width (about 730 px, against about 350 px beside the
  facts at 1024). The pen state is already on the toolbar's "Stop editing" button; the facts return when the selection
  clears. All eleven (or fifteen) commands stay on screen with their labels.
- **Costs (estimates, not built):** eleven labelled controls are about 940 px of buttons, so two lines at 730 px: **+36 px,
  diagram about 326 px** at 1024 × 600 (against 246 now, and 24 short of the 350 px floor). Fifteen controls may need three
  lines (+76, about 286) in the worst case; that must be measured before M6 commits to this. A bar low in the diagram
  would still be panned, by about 12 px as at 768 and 900. The facts disappearing during a selection is a loss of
  context for the length of a selection.
- **Keeps:** every command visible and labelled (the owner's stated rule), no overflow, no `Toolbar` contract change
  (this is the foot row's layout, not the toolbar's items).

### S-C: icon-only on a short window (spec S2), no overflow

- **What changes:** each control drops its label (ADR-0185 D7's `labelVisibility`), keeping its accessible name and a
  tooltip (ADR-0117).
- **Costs (estimate, not built):** eleven icon buttons at the 36 px control height are about 440 px, fitting one line even
  beside the facts: **+0 px**. But a row of unlabelled icons is the cost the owner has already weighed on this bar (the
  labels were added and kept deliberately), a reader must hover to learn "Duplicate" from "Duplicate band" and
  "Isolate" from its options, and the spec's own evidence (ADR-0187's reading) says it was not enough at 1024 wide in a
  different bar. Shaded commands lose their visible reason cue.
- **Keeps:** every command visible and in place.

### Recommendation

**S-B first** (the bar takes the whole row, facts yield), **with the reveal fixed separately**, and **S-A held back** as the
fallback only if M6's first measurement shows the fifteen-control worst case needs more than two lines at 1024 × 600.

Reasons: it is the only candidate that keeps the owner's rule in full (all commands visible, with labels) and needs no
overflow; it removes two of the four lines at 1024 × 600 for the cost of a context strip that is redundant while
something is selected; and it changes a layout rule, not the `Toolbar` contract, so it needs no public-contract ADR.
S-A would beat it on height (one line) and is the safe answer if the worst case does not fit, so M6's task 1 should
measure the fifteen-control bar before choosing. S-C is the weakest: it trades the reason people will notice (no
labels) for the one cost the line count does not demand.

**The jump gets its own, smaller fix whichever shape wins (spec S3):** a selection made by a pointer should not pan a bar
that is still wholly visible. That means taking the 60 px margin out of the reveal for a pointer selection (keep it for
keyboard navigation, where WCAG 2.4.11 wants the ring clear of edges) and, when the bar is truly hidden by the shrink,
moving it by the shrink only. Together with S-B, the move at 1024 × 600 would be at most about 36 px for a bar in the
bottom strip and none for the rest. This is a change to the canvas's reveal, so it needs the keyboard-contract review
(ADR-0111) and the canvas suites.

## The plural bar (for M7)

**Measured today:** one 122 px `NoticeStrip` at 1024 × 600 (foot 51 → 173, diagram 362 → 240) and still 122 px at 1366
and 1440 (foot 133, so 82 px more than the single bar there), because its height is the wrapped sentence plus the drag
hint plus the buttons, none of which is a command.

**Proposed shape (not built):** one line, `3 selected` as a short caption, then the actions in a group (Link in
sequence…, Move to swimlane… when the plan has swimlanes, Set code… when it has codes, Delete) and Clear selection at the
end. At most one status sentence, and only when something is refused (today's `status`, which is also the buttons'
`aria-describedby`). The long subject sentence ("… is the subject of single-activity actions") becomes the bar's
accessible description rather than visible text, since the single-activity actions it explains are absent from this bar.
The move hint ("Dragging any of these, or pressing Alt with an arrow key, moves all 3") stays **spoken**, as the panel
already speaks it when the selection turns plural, and moves to a tooltip on the caption instead of a visible line.
**No overflow on any window:** five controls and a caption are about 650 px, which fits one line at 1024 and wraps to two
only in the worst case (a refusal sentence beside all five). The button must stay lit (`TsldPanel.tsx:3386-3394`). Cost
estimate: **+0 px** for one line against +122 now; not built, and the five-control worst case is not measured.

## What was not done

- No candidate was built in the probe; the S-A, S-B, S-C and plural-bar figures are inferences from the line-cost reading
  and are marked as such.
- 200 % text, coarse pointer, 1920 × 1080, and the swimlane, code, conflict and summary variants of the single bar were not
  read. The fifteen-control worst case, which decides between S-A and S-B, is therefore open.
- Chromium only.
- The first-line-is-free claim is read from three points (4, 3 and 2 lines), not from a one-line bar.
