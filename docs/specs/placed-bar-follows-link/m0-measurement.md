# Placed bar follows link, M0: measurement record

- **Date:** 2026-11-11. **Tree:** `m0-follow-logic` = `origin/main` (web 1.1.1, after #1309 and #1310) plus the spec's approval record.
- **Spec and plan:** [`feature-spec.md`](./feature-spec.md), [`implementation-plan.md`](./implementation-plan.md) (Tasks 0.1, 0.2, 0.3).
- **Harness:** four throwaway files under `apps/web/measure-toolbar/` (`follow-logic-m0-runbook.spec.ts`, `follow-logic-m0-data.spec.ts`,
  `follow-logic-m0-width.spec.ts`, `follow-logic-m0-support.ts`), run by the existing `playwright.measure-toolbar.config.ts`. A harness, not a
  gate (ADR-0081 §3): no CI step, no new config, nothing under `apps/web/src` or `apps/api/src` changed.
- **What is real and what is not.** Real sign-up, real API on a real Postgres, real Chromium 156 in this container. Fonts, scrollbars (headless
  Chromium draws overlay scrollbars) and speed differ from the owner's Surface Pro (ADR-0128), so every pixel figure is a reading from here, not
  from his machine. **The offer copy in Task 0.2 was injected, not shipped**: see that section.
- **Raw readings** (every cell, every state) are committed beside this file in [`readings/`](./readings/).
- **How a run is invoked** (from the worktree root):

  ```text
  export NODE_OPTIONS=--max-old-space-size=8192 PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
  scripts/e2e-local.sh measure:toolbar -- follow-logic-m0-runbook.spec.ts follow-logic-m0-data.spec.ts
  scripts/e2e-local.sh measure:toolbar -- follow-logic-m0-width.spec.ts
  ```

  Both passed (`6 passed`, `2 passed`). The probe writes JSON to `apps/web/measure-output/` (git-ignored); the files in `readings/` are copies.

## Summary, in plain English

The owner's finding is real, and the spec's picture of it is right. Drawing three bars, linking them with the Link tool and then making the first one
longer leaves the second bar where it was drawn and raises one conflict; nothing on screen says so while it happens. The same is true of linking a bar
that was drawn too early. When the bars after it are placed close together, one lengthening strands two of them, so the "several bars" wording is needed.
The planned offer would write the right thing: clearing a bar's placement puts it exactly where its links put it, keeps its constraint, and an
existing test never covered that case, so M2 adds one.

**One thing in the spec does not hold, and it matters for the layout: the offer does not fit the dock on a 1024-wide window the way the spec assumes.**
On a window that size the dock's message area is only about 345 px wide. The offer's sentence plus two buttons needs about 600 px on one line, so with
the product's ordinary strip either it spills out sideways (and two buttons can end up under something else, unclickable by pointer) or it wraps to four
or five lines. On a touch screen at 1024 × 600 with any bar selected there is already only 2 to 18 px of room above the 120 px minimum the diagram needs,
and any one-line strip costs 66 px, so the diagram drops to 56 to 72 px. The strip that exists today (the "Linked …" confirmation) does the same, so
this is not new, but it means the spec's success criterion SC-6 cannot be met as written without a decision about where the strip goes. That decision is
not made here. At 1440 × 900 and 1912 × 1080 everything fits on one line, except the longest copy variants, which wrap to two lines.

Two smaller things differ from the spec. "Clear visual start" is never moved into the `⋯` menu in any size measured (the bar wraps instead), and a
placed summary row can exist and be flagged, which the spec thought unlikely. Neither changes the plan.

## The checks

| #   | Check (where the spec or plan asks)                                                                                 | Reading                                                                                                                                                                                                                        | Verdict                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| C1  | Drawn bars carry a placement; linking and lengthening raise no message (spec §1 items 1 and 5; the owner's 3.5–3.8) | Every drawn bar has `visualStart`; after the lengthening exactly the successor is flagged and the dock and announcer say nothing about it (§1)                                                                                 | **CONFIRMED**                                                                      |
| C2  | The Link tool stays armed after a link and the `linked` confirmation is what the dock shows (spec §1 item 4)        | Link button still reads `Linking · FS` after each link; the dock shows `Linked “A” → “B” (FS).` with Undo only; Esc removes it (§1)                                                                                            | **CONFIRMED**                                                                      |
| C3  | A chain: one edit strands B and C (spec Edge cases; plan 0.1 step 1)                                                | With C drawn near B, lengthening A flags **both**; with C drawn far to the right it flags **only B** (§1)                                                                                                                      | **CONFIRMED**, with a condition                                                    |
| C4  | A link can strand a bar at the moment it is made, while the tool is still armed (spec §1 item 4's consequence)      | Linking A to a B drawn earlier flags B at once; the dock shows only the confirmation, the announcer only the link (§1)                                                                                                         | **CONFIRMED**                                                                      |
| C5  | "Clear visual start" is inline or in `⋯` at 1024 × 600 and 1440 × 900 (plan 0.1 step 3; spec §1 item 4)             | **Inline** at both sizes, both pointers, and in every cell of the width probe; no overflow button exists; the bar wraps instead (§1)                                                                                           | Placement CONFIRMED; spec's "first to move into the `⋯`" **OVERTURNED** (minor)    |
| C6  | A started activity can be placed and flagged through the product (spec Edge cases)                                  | Yes, in one order: place first, then report progress (§3). Clearing then changes no date and clears the flag. A drag cannot place a started bar (refused in code)                                                              | **CONFIRMED**                                                                      |
| C7  | A `WBS_SUMMARY` can be placed, and flagged (spec Edge cases)                                                        | Yes to both through the API (§3). The batch route refuses it (422), the per-object route clears it (200). A flagged summary cannot come from a link or duration edit, only from a bound such as the data date                  | **CONFIRMED**, spec's "cannot be stranded" **OVERTURNED** in part                  |
| C8  | An API e2e case for a placed row cleared with its constraint round-tripped exists (plan 0.3 step 2)                 | **None exists** (§3). The probe shows the behaviour is right on the real API: constraint kept, placement cleared, flag cleared                                                                                                 | Behaviour **CONFIRMED**; test gap **CONFIRMED**, so M2 adds the case               |
| C9  | The snapshot diff is cheap beside auto-resolve's 8.8 ms p95 (plan 0.3 step 3; spec §3 Performance)                  | Stand-in diff over 2,160 real `scale-2000` rows: p50 0.1 ms, p95 0.3 ms, max 0.4 ms (n = 50 after 20 warm-ups, Chromium)                                                                                                       | **CONFIRMED** (the real function does not exist yet)                               |
| C10 | Every planner edit path calls `beginLayoutEdit` (plan 0.3 step 4)                                                   | All five named paths do (§3); the census test passes (6 of 6)                                                                                                                                                                  | **CONFIRMED**                                                                      |
| C11 | A catalogue plan earns a playbook row (plan 0.3 step 5)                                                             | No new row is earned; one existing plan already shows the standing condition (§3)                                                                                                                                              | Decision recorded                                                                  |
| C12 | The draft copy fits the dock at 1024 × 600 fine and coarse, and at 1912 × 1080 (plan 0.2; spec SC-6; plan risk row) | At 1024: **does not fit** nothing selected (overflow or 4–11 lines); with a selection the one-line strip fits its row but takes the diagram below 120 px on touch. At 1440 and 1912: fits (§2)                                 | 1912 and 1440 **CONFIRMED**; 1024 **OVERTURNED** (SC-6 and the "shorten copy" fix) |
| C13 | The 120 px stage floor margin on touch 1024 × 600 (plan 0.2 step 2; `docs/TECH_DEBT.md` #488)                       | Base margin **2 px** with a flagged bar selected (stage 122), **18 px** with an unflagged placed bar selected (stage 138); a strip takes both below the floor (§2)                                                             | Instrument **CONFIRMED** (reproduces #488's 2 px); floor **BREACHED** by any strip |
| C14 | The label `Follow logic` is narrower than `Clear visual start` and moves no foot row (plan 0.2; M1's gate)          | 146 → 113.8 px fine, 154 → 121.8 px coarse. No line or foot-row change at 1024 or 1440. At 1912 touch the bar goes from 2 lines to 1 (foot row −48 px); at 1912 fine the bar is 32 px narrower and the foot row unchanged (§2) | **CONFIRMED**, with a figure M1 must record                                        |

## 1. Task 0.1: the owner's runbook, drawn

**Method.** `follow-logic-m0-runbook.spec.ts`. A new account, organisation, client, project and a plan starting 2026-01-05, then everything through the
product's own gestures: the Add tool draws three tasks by clicking the canvas (so each is saved with a placement, as in step 3.5); the Link tool links
the first to the second and the second to the third by two clicks each (3.6, 3.7); the first bar's finish handle is dragged to the right with the mouse
(3.8). Seeding is not used for any of this. After every step the state is read from the API (`GET …/plans/:id/activities`), polling until two reads
agree, never from the DOM. Four runs: `owner` (the runbook as written), `owner` on a coarse pointer, `chain` (the third bar drawn near the second) and
`linkstrand` (the second bar drawn **before** the first). The readings are in `readings/follow-logic-m0-runbook.*.json`.

| Run                | Drawn (start dates)                                         | After the links                                          | After lengthening A                                      |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `owner`, fine      | A 19 Jan, B 2 Feb, C 18 Feb; all three have a `visualStart` | No flag after A→B, none after B→C                        | A 1 → 13 days. **B flagged `EARLIER_THAN_LOGIC`, C not** |
| `owner`, coarse    | same dates                                                  | same                                                     | same (A 1 → 13 days, only B flagged)                     |
| `chain`, fine      | A 19 Jan, B 23 Jan, C 26 Jan                                | none                                                     | A 1 → 9 days. **B and C both flagged**                   |
| `linkstrand`, fine | A 2 Feb, B 19 Jan, C 18 Feb                                 | **B flagged the moment A→B is made**; none new after B→C | not run (the link was the edit)                          |

What each reading says:

- **C1.** In every run all three drawn bars have a `visualStart` (`everyDrawnBarHasAPlacement: true`). The two links raise no flag because the bars were
  drawn in link order. Lengthening A leaves B drawn at its placement and flags it. After the lengthening the dock shows no strip
  (`modeBand: null`, `layoutResolved: null`) and the announcer says only `“Excavate” now 05 Jan 2026 to 21 Jan 2026.` (or the chain run's equivalent):
  nothing says a bar was left behind. That matches the owner's report.
- **C2.** After the first link the toolbar still carries a button named `Linking · FS` (`linkToolStillArmed: true`), the dock's mode band reads
  `Linked “Excavate” → “Pour slab” (FS).` followed by `Undo`, and the same sentence is the announcer's text. The second link goes straight through with
  no re-arming. After Esc the band is gone (`modeBand: null`, announcer `Tool closed. Select mode.`). `dock-strip.ts:94` reads
  `if (input.modeStatement) return 'mode';` above every lower rung, which is why a lower strip would be hidden while the tool is armed.
  **Not tested:** a real lower strip (the layout notice, say) beside an armed tool; that is read from the function, not measured.
- **C3.** In `owner` the third bar was drawn 16 days after the second, so B's logical finish does not reach it. In `chain` it is 3 days after, and
  both are flagged. The chain case is real and needs the plural wording, but whether an edit strands one bar or several depends on how the bars sit.
- **C4.** In `linkstrand` the flag appears at the link itself while the Link tool is armed; the dock and the announcer carry only
  `Linked “Excavate” → “Pour slab” (FS).` This is the case spec §4.6 builds the "confirmation carries the offer" rung for, and it is real.
- **C5.** Selecting the flagged bar at 1024 × 600 and 1440 × 900 lists eleven inline items including `clear-visual-placement` (`Clear visual start`),
  `clearVisualInline: true`, `hasOverflowMenuButton: false`, in both pointer runs. The width probe (§2) finds it inline at 1912 × 1080 as well. The bar
  wraps (4 lines at 1024 fine, 3 on touch) rather than demoting items, which agrees with ADR-0109 D1 and contradicts the spec's sentence that it is
  "the first to move into the `⋯` under width pressure" (a comment at `selection-actions.tsx:1048-1051` that predates the wrapping deck).
  **What this changes in the spec:** only that sentence (§1 item 4); the plan loses nothing, because M1's reading of "width" is the wrapped lines in §2.

An aside, observed and not investigated: after the lengthening the announcer says A now runs `05 Jan` to `21 Jan` while A is drawn from its placement
on 19 Jan. It is the schedule's early dates, not the drawn bar. Outside this epic.

## 2. Task 0.2: width and fit

**Method, and why the copy is injected.** `follow-logic-m0-width.spec.ts`. The offer strips do not exist in the product, so nothing shipped could be
measured. Instead, after a real Link-tool link, the probe captures the real `canvas-mode-band` confirmation's HTML (a real `NoticeStrip` with a real
`Button`), and for each reading clones it into the real dock outlet with the sentence and buttons replaced by the spec's draft copy (§4.6) and the
buttons cloned from the real Undo button. **The copy was injected into the running page; none of it is shipped, and nothing is wired to anything.**
The outlet, foot row, stage, selection bar, fonts and widths are the product's own. The shipped confirmation itself, cloned the same way with its own
words, is the **control**.

Five variants: edit-one `“Pour slab” stays where you placed it, before its logic allows.` (Follow logic, Keep it here); the same with a 46-character
activity name; edit-several `“Pour slab” and 2 others stay where you placed them, before their logic allows.`; plan `3 bars stay where they were
placed, before their logic allows.` (Follow logic, Dismiss, dashed); and the Link confirmation plus the offer, `Linked “Excavate” → “Pour slab” (FS).
“Pour slab” stays where you placed it, before its logic allows.` (Undo, Follow logic, Keep it here). Each is read with `NoticeStrip`'s default message fit
(`truncate`) **and** with `grow`, in three selection states (nothing selected; an unflagged placed bar selected, which is the real state right after a
lengthening; the flagged bar selected), at 1024 × 600, 1440 × 900 and 1912 × 1080, on a fine and a coarse (`hasTouch`) pointer. Readings per cell: foot-row
height, stage height, the outlet's width, the strip's box, whether its sentence is cut or wraps, whether it overflows the outlet or overlaps a neighbour,
and, for each button, whether its own centre is what a pointer hits there. The pointer type was read back in every cell (`coarse` false and true as run).

**Instrument check.** The stage height with the flagged bar selected on touch at 1024 × 600 reads 122 px, which is `docs/TECH_DEBT.md` #488's "2 px of
margin" over the 120 px floor, reproduced.

**1024 × 600, nothing selected** (the dock's outlet is 348 px fine, 344 px touch):

| Variant                      | Natural width of strip | `truncate` fit: outlet overflow, buttons not hit                     | `grow` fit: lines, foot-row height (base 51) |
| ---------------------------- | ---------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| Control (shipped, one Undo)  | 333.8 px               | none, fits                                                           | not run (control)                            |
| edit-one                     | 631.1 px               | 283 px; both buttons covered (touch: 287 px)                         | 5 lines, 125 (touch 5 lines, 121)            |
| edit-one, long name          | 835.3 px               | 487 px; a button past the foot row's edge, foot row scrolls sideways | 8 lines, 185                                 |
| edit-several                 | 744.8 px               | 397 px; both covered                                                 | 6 lines, 145 (touch 7 lines, 161)            |
| plan                         | 606.3 px               | 258 px; both covered                                                 | 4 lines, 105                                 |
| Link confirmation plus offer | 942.2 px               | 594 px; two buttons past the foot row's edge, three not hit          | 11 lines, 245                                |

The sentence is the whole problem: the two buttons are 99.8 and 101.1 px wide, and with the strip's padding and gaps they leave about 100 px of a
348 px outlet for words, so no wording fits one line. With `truncate` the strip does not narrow to the outlet: it stays at its natural width and
overflows (`textTruncated` was `false` in all 198 strip readings, so the ellipsis never engaged). The probe did not test why; a likely cause is the
strip's own minimum width inside the outlet, and M2 would have to establish it before choosing a fit.

**1024 × 600 with a bar selected** (the outlet widens to 731 px on touch because a selection bar is `data-dock-wide`; it stays 348 px on a fine pointer):

| State and pointer                    | Base foot row, stage | A one-line strip costs | Stage with the strip | Floor margin (stage − 120)       |
| ------------------------------------ | -------------------- | ---------------------- | -------------------- | -------------------------------- |
| Touch, unflagged placed bar selected | 191, **138**         | 66 px (58 + 8 gap)     | **72**               | base **+18**, with strip **−48** |
| Touch, flagged bar selected          | 207, **122**         | 66 px                  | **56**               | base **+2**, with strip **−64**  |
| Fine, unflagged placed bar selected  | 167, 286             | 54 px (46 + 8 gap)     | 232                  | +166, then +112                  |
| Fine, flagged bar selected           | 187, 266             | 54 px                  | 212                  | +146, then +92                   |

On touch the strips for edit-one, plan and the short variants fit their 731 px row on one line; edit-several overflows by 14 px, the long name by 104 px
and the Link confirmation plus offer by 211 px (two buttons past the foot row's right edge). On a fine pointer the outlet is 348 px, so a strip
overflows it by the same 258 to 594 px as above (no button is covered in these states), or with `grow` wraps to 4 to 11 lines and takes the stage to
164, 104 and 44 (edit-one, long name, Link confirmation plus offer) with the unflagged bar selected and 144, 84 and 24 with the flagged one, against the
120 floor.
**The shipped control strip alone takes the touch stage to 72 and 56 as well**: the floor is already breached today by an armed tool or a just-made link
with a bar selected. This was not known; #488 measured the selection bar only.

**1440 × 900:** everything fits the 764 px (fine) or 760 px (touch) outlet on one line, no button is covered, the foot row grows by 54 (fine, every
state) or by 14 (touch, nothing selected) or 66 (touch, a bar selected), and the stage keeps 504 to 668 px. Exceptions: the long-name variant (835 px) and the Link confirmation plus offer (942 px) overflow the outlet by
71 to 75 px and 178 to 182 px with `truncate`, or wrap to two lines (+8 px) with `grow`.

**1912 × 1080:** every variant, both fits, both pointers, all three selection states: one line, no overflow, no clipped or covered button, no sideways
scroll. Cost: 6 px fine or 14 px touch when sharing the facts' line with nothing selected, 54 or 66 px with a bar selected.

**Selection-bar label.** `Follow logic` swapped into the real bar's text node in place (the bar's own width measurement is not re-run, so the true
build could differ; the DOM reflowed with the bar's own wrapping):

| Cell and pointer       | Remedy item width                       | Bar lines                            | Foot row (flagged / unflagged)         |
| ---------------------- | --------------------------------------- | ------------------------------------ | -------------------------------------- |
| 1024 × 600, 1440 × 900 | 146 → 113.8 (fine), 154 → 121.8 (touch) | unchanged (4/4, 2/2 fine; 3/3 touch) | unchanged                              |
| 1912 × 1080 fine       | 146 → 113.8; bar 1074.4 → 1042.2        | 1 → 1                                | unchanged (67 / 51)                    |
| 1912 × 1080 touch      | 154 → 121.8; bar 1180.1 → 1158.2        | **2 → 1**                            | **115 → 67 and 99 → 51 (−48 px each)** |

`e2e-workspace-chrome/dock.spec.ts` asserts that a selection costs the diagram nothing at 1646 × 1097; **1646 was not measured here**, so whether that
equality still reads zero is argued (a narrower label cannot add a line) and not read. M1 runs that suite anyway.

**Not measured:** the Gantt's dock (the strips go in the same outlet, but no strip was injected there); 1280 and 1646 wide; a real Surface Pro; a classic
scrollbar; the product's own `Follow logic` button once it exists.

**What this overturns in the spec, without redesigning it.** (a) §4.6 says the strip is a `NoticeStrip` carrying one sentence; at 1024 a strip with the
default `truncate` fit overflows the outlet and a `grow` fit wraps to 4 to 11 lines, so "a one-line strip in the dock" is not achievable there with that
primitive and that copy. (b) The plan's M2 risk row ("shorten copy first, then drop the band's own Undo") cannot work at 1024 fine with nothing
selected: the buttons alone take about 250 of 348 px. (c) SC-6 ("the strip fits the dock without clipping a control at 1024 × 600") is met on a fine
pointer only with a selection, and is not met on touch with a bar selected, because the stage falls below 120 px for any strip, the shipped one
included. M2's strip layout needs a decision from the owner (where the strip renders at 1024, or whether the stage floor yields); that is not made here.

## 3. Task 0.3: data and cost questions

**Method.** `follow-logic-m0-data.spec.ts` for the API reads (a signed-in session in the page, the product's own endpoints, the same single `PATCH`
the drag and the Progress dialog send; every response status recorded in `readings/follow-logic-m0-data.json`), and file reads for the rest.

**Step 1a: a placed `WBS_SUMMARY`.** A task placed at 2 Feb was converted to `WBS_SUMMARY` with the PATCH the editor's type field sends: 200, and it
**keeps** its placement (`placed 2026-02-02`, drawn there). A direct `PATCH visualStart` on the summary is also accepted (200). Placed on 1 Dec 2025,
before the 5 Jan data date, it reads `visualConflictReason: EARLIER_THAN_LOGIC`. The batch route refuses it:
`422 SUMMARY_NOT_BULK_ELIGIBLE` ("A WBS summary cannot be placed: its dates roll up from its children", `activities.service.ts:1412`). The per-object
clear (`PATCH visualStart: null`) is accepted (200) and the flag clears. **Through the gestures:** the Gantt refuses to move a summary
(`bar-drag.ts:81-89`, "A summary follows the activities inside it") and the diagram offers it no resize handles (`hit-test.ts:92`); whether a diagram
drag can place one was **not tested in a browser**, and the way found here is the type change. **What this means:** a placed, flagged summary can exist,
and the conflict count includes it, but a link or duration edit cannot strand it (it has no links of its own). The spec's edge-case row is right that it is
excluded from both batches, and wrong to imply nothing placed can be flagged; the whole-plan offer's count must exclude it explicitly, so it can read one
fewer than the toolbar's conflict count.

**Step 1b: a started activity, placed and flagged.** S (3 days) follows P; S placed on 6 Jan, before its logic allows (flagged, drawn 6 Jan); progress
reported with `actualStart 2026-01-05` and 40 %: 200, S still flagged and now drawn on 5 Jan (its actual). An actual after the data date is refused
(`ACTUAL_AFTER_DATA_DATE`), which is why 5 Jan was used. Clearing S's placement through the batch route: 200, `placed: null`, **drawn 5 Jan before and
after** (no date moves), flag cleared. So the spec's claim ("clearing changes no date … the flag clears") holds. Through the product the only order that
reaches this state is place first, report progress after: the Progress dialog calls `PATCH …/activities/:id/progress`
(`use-activities.ts:495`), and a drag of a started bar is refused (`START_EDGE_FROZEN_REASON`, `hit-test.ts`; `barMoveGate`, `bar-drag.ts:84-87`).

**Step 2: API e2e coverage.** `apps/api/test/activity-batch-ops.e2e-spec.ts` has `place()` (a complete row with `visualStart: null` by default) and one
case that writes constraints through the batch (`:149-176`, rows that had **no placement**, gaining a constraint in the same call) and one that clears a
constraint (`:179-190`). `apply-levelling.e2e-spec.ts:341-` checks that a row **carries** the constraint unchanged while writing a non-null placement.
**No case starts from a row holding both a placement and a constraint and writes back `visualStart: null` with the constraint unchanged.** The probe ran
it on the real API: K (SNET 2 Feb, placed 12 Jan, flagged) written back with `visualStart: null` and `SNET 2026-02-02`: 200, constraint unchanged, placement
null, drawn 2 Feb, flag cleared (`constraintKept: true`). **M2 adds that case** (test only), as plan §4.5 says.

**Step 3: the diff's cost.** A stand-in written to the spec's definition (flagged now, not flagged before, placed, not a summary, `visualStart`
unchanged), over 2,160 rows built from `scaleSpec({ activities: 2000 })` (every row placed, which is the worst case for it; 50 newly flagged), in the
real Chromium: **p50 0.1 ms, p95 0.3 ms, max 0.4 ms** (n = 50 after 20 warm-ups; four runs read p95 0.3, 0.4, 0.3 and 0.3 ms). Snapshot **and** diff are timed
together, so this over-states the settle's share. Against auto-resolve's 8.8 ms p95 (`use-auto-resolve-overlaps.ts:69-73`) it is about 30 times smaller.
**Limits:** the function it times does not exist yet; headless Chromium here is not the owner's machine (`docs/TECH_DEBT.md` #75); the rows are the
generator's, not an engine result.

**Step 4: the `beginLayoutEdit` census.** `pnpm --filter @repo/web exec vitest run
src/components/layout/workspace/use-auto-resolve.census.structural.test.ts`: 6 of 6 pass. The five paths, by handler in
`use-plan-workspace-model.ts` (line of the call): the Link tool is `onTsldLink` (`:2129`); the Logic tab's add and edit are `recordDependencyAdd` (`:1456`)
and `recordDependencyEdit` (`:2110`), remove is `recordDependencyRemove` (`:1437`); the chain link is the bulk "link in sequence" in
`bulkOperations` (`:1243`); a duration drag is `onTsldResize` (`:1934`); a Gantt cell commit goes through `model.recordActivityUpdate`
(`plan-workspace-toolbar.tsx:1443`), which calls it at `:1392`. Ten other record sites carry a `layout-exempt:` comment stating why (lane-only writes, re-parenting, steps, a dialog
create, a dissolve, the diagonal drag's second half, and the cross-plan link pair at `:1680` and `:1700`, which the spec already puts out of scope).

**Step 5: a catalogue plan.** `pnpm check:playbook`: `Playbook OK — 52 plans`. `plan:capability-placements` already exhibits a placed, flagged bar
(`PL_EARLIER`, placed inside its predecessor's span, `docs/TEST_PLAYBOOK.md:84`), which is the whole-plan offer's N = 1 condition, so no new plan is
earned for M3. The edit offer is raised by an edit, not by stored state, so no seeded plan can prove it; the journeys build their own. **Decision:** no
new row; M3 may add one sentence to the `capability-placements` row naming the whole-plan offer, if the owner wants the catalogue to say so.

## Premises: what is settled and what to do about it

| Premise                                                         | Verdict                   | Effect on M1 to M3                                                                                                                        |
| --------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The trigger (a settled edit that newly flags a placed bar)      | Confirmed (C1, C3, C4)    | None                                                                                                                                      |
| The Link confirmation must carry the offer                      | Confirmed (C2, C4)        | None                                                                                                                                      |
| The label `Follow logic` saves width and moves no gated row     | Confirmed (C14)           | M1 records the 1912 touch figure (foot row −48 px) beside `dock.spec.ts`                                                                  |
| Clear-via-batch is exact for started rows and keeps constraints | Confirmed (C6, C8)        | M2 adds the API case                                                                                                                      |
| The diff is cheap                                               | Confirmed (C9)            | None                                                                                                                                      |
| **The strip fits the dock at 1024 × 600 (SC-6, plan risk row)** | **Overturned (C12, C13)** | **M2 cannot be built as specced until the owner decides where the strip renders at 1024, or whether the 120 px stage floor yields to it** |
| "Clear visual start" is the first item to move into the `⋯`     | Overturned, minor (C5)    | Spec §1 item 4's sentence is wrong; nothing built depends on it                                                                           |
| A summary placed and flagged cannot occur                       | Overturned in part (C7)   | The whole-plan offer's N excludes summaries and can read lower than the conflict chip; M3's copy or a footnote should say so              |

The instrument check in §2 (the touch stage height reproducing #488's 2 px) shows the width reading is the same one the repository already trusts.

---

# M0b: option A measured (amendment 1, 2026-11-11)

- **Date:** 2026-11-11. **Tree:** `m0b-follow-logic` = `m0-follow-logic` (02a2c65) plus the probe commit. **Question:** does option A in
  [`amendment-1-offer-at-1024.md`](./amendment-1-offer-at-1024.md) (the offer takes a row of its own when it does not fit beside the plan facts) hold the
  amendment's four stop rules (its section 4)? The owner approved the amendment with all three defaults the same day; that approval folds the amendment
  into the spec and plan **only if no stop rule fires**.
- **Probe:** `apps/web/measure-toolbar/follow-logic-m0b-offer-row.spec.ts`, run by the existing `measure:toolbar` target. A harness, not a gate
  (ADR-0081 section 3): no new Playwright config, no CI step, **nothing under `apps/web/src` changed**.
- **Raw readings:** [`readings/follow-logic-m0b-offer-row.fine.json`](./readings/follow-logic-m0b-offer-row.fine.json) and
  [`.coarse.json`](./readings/follow-logic-m0b-offer-row.coarse.json): every cell, every state, with the sentences the product produced.
- **Command** (from the worktree root; the two pointers are two tests in one file; the run these figures come from reported `2 passed (7.3m)`):

  ```text
  export NODE_OPTIONS=--max-old-space-size=8192 PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
  scripts/e2e-local.sh measure:toolbar -- follow-logic-m0b-offer-row.spec.ts
  ```

  The probe wrote the JSON to `apps/web/measure-output/` (git-ignored); the files in `readings/` are copies. Earlier runs of the same file were
  discarded because of probe faults, all fixed before the run reported here: the alternative rule's selector was matched together with option A's (so
  the two modes read the same), the Gantt stage was read from an element that does not shrink with the foot row, and the Gantt's selection cannot be
  cleared once made (no Clear selection button on a mouse, and Escape does not reach it), so the Gantt is read selection-major with `none` first.

## Summary, in plain English

**Option A works at the sizes a planner uses at normal text size, but it fails two of the amendment's four tests, so the amendment is not folded in and
this comes back to the owner.** At 100 % text, in every window from 1024 to 1912 wide, on both pointers and in both the Diagram and the Gantt, the offer
takes a line of its own when it does not fit beside the plan facts: at most two lines of words (one line at 1250 and wider), every button is
pressable, nothing scrolls sideways, the diagram's corner buttons stay inside the diagram, and with nothing selected the diagram never drops below
216 px (finger) or 344 px (mouse). That is stop rule 3 at normal text size, and stop rule 2, both holding. Two things do not hold. **At 200 % text on a
1024 window** (stop rule 1 and, by one of the two ways of enlarging text, stop rule 3) the offer takes 2 to 11 lines, and with nothing selected its buttons
end up past the window's edge. **And on a mouse at 1912, with a bar selected, the offer costs the Diagram 98 px but the Gantt 40 px** (stop rule 4): in
the Diagram the selection bar and the offer no longer share a line, so the plan facts get a line of their own too, the 36 to 40 px that ADR-0187 D3
refused to pay for the selection bar. The same 36 to 44 px also appears in the Gantt at 1646 and 1912; the amendment's stop rule 2 only asked about 1120
to 1250, where the extra cost is zero. Separately, the three existing foot messages (the bare "Linked ..." confirmation, the layout-resolved notice and
the undo result) **do** spill out of the dock with long activity names, as the amendment suspected, and the design review's guess about why is right:
adding `min-w-0` to the strip alone makes the existing ellipsis work. That evidence is ready for the separate register row (Q3).

## What was injected, stated plainly

Nothing in the product was changed. Every strip is a clone of the real `NoticeStrip` the running page rendered, captured from a real Link-tool link
between two real bars (or, for the undo result, from a real Ctrl+Z), with its sentence and buttons replaced and put into the real dock outlet.
**Option A** is three injected things and nothing else:

1. `data-dock-row` on the cloned strip;
2. a stylesheet rule that is the compiled form of the outlet class `has-[[data-dock-row]]:basis-auto`:
   `[data-activities-bar] > div[class*="not-empty:min-w-"]:has([data-dock-row]) { flex-basis: auto; }`;
3. the strip's message fit `grow` (the `<p>` is `flex-1`) and density `comfortable` (`items-start py-2` in place of `items-center justify-between py-1.5`).

The **alternative rule** (stop rule 2's fallback: the marker counts only when no `data-dock-wide` selection bar is in the outlet) was read at 1120 and
1250 on a mouse. It was not needed (rule 2 held) and it was worse: cost +66 to +146 px in the Diagram against +58 to +66 for option A. The **`min-w-0`
test** adds that one class to the existing strips. The offer's **copy** is the spec's draft, injected. The three **existing** messages use sentences the
product built: the Linked band and the undo result are the live strips' real HTML and real sentences from the run; the layout-resolved notice is the
Linked band's HTML (both are `NoticeStrip tone="muted"`, compact, `truncate`, and `LayoutResolvedStrip.tsx:38` passes nothing else) carrying
`sentenceFor`'s one-bar sentence, because a real overlap resolution was not triggered. **Not the product:** the offer's sentences and button labels,
and the fact that nothing is wired.

**Fixture** (a new account on a real API and Postgres, real Chromium 156 in this container; ADR-0128: every pixel figure is from here and not from the
Surface Pro). Bars drawn with the Add tool: `Excavate` and `Pour slab` (linked through the API, `Pour slab` placed on 6 Jan so it is flagged
`EARLIER_THAN_LOGIC`) and two 46-character names, `Install structural steel to level 3 west wings` and `Fabricate and erect precast stair cores, blk B`,
linked with the Link tool (the probe asserts both are 46 characters). The undo result is the real strip from drawing a third long-named bar and
pressing Ctrl+Z (`Undid add “Commission the rooftop plant and chilled water loop”.`, buttons `Redo` and `Dismiss`).

## What was read

Cells: 1024 x 600, 1120 x 700, 1250 x 800, 1280 x 800, 1440 x 900, 1646 x 1097, 1912 x 1080; a mouse (fine) and a finger (coarse, `hasTouch`; the
pointer type was read back in every reading); nothing selected, `Excavate` selected (a placed bar, not flagged) and `Pour slab` selected (flagged);
the Diagram and the Gantt; the five variants of the amendment (`edit-one`, `edit-one-long-name`, `edit-several`, `plan`,
`link-confirmation-plus-offer`); plus 1024 x 600 at 200 % text by two routes. **Per reading:** the strip's lines, height, width and overflow of the
outlet; whether a pointer at each button's centre hits the button (`elementFromPoint`); whether a button is past the foot row's right edge or the
window's right or bottom edge (`clipped`); foot row and stage height; sideways scroll of the foot row and the page; whether the Diagram's corner
cluster is inside the stage; the selection bar's line count and label (every selected reading names the intended activity). The two routes to 200 %:
the root font size set to 200 % (a user style sheet's effect; it does not move the rem media queries; the selection is made at 100 % first because the
list cannot take focus after) and Chromium's `Page.setFontSizes` (what a browser's own text-size setting does; the rem media queries answer; the page is
reloaded, then reloaded again at 100 %). The Gantt's stage is the tallest ancestor of the grid that ends where the foot row begins. **A cost** below is
the foot row's growth against the same cell with no strip; **extra** is cost minus the strip's own height minus the 8 px gap to the selection bar (no
gap with nothing selected). Totals: 420 option A readings at 100 % text across both pointers and both views, 84 existing-message readings, 5 live
readings per pointer.

## The readings, in brief (option A, 100 % text, injected)

Stage is the diagram or Gantt height above the foot row. Each row spans the five variants unless stated.

| Cell (selection), pointer | Stage without a strip | Stage with option A | Strip lines | Cost (px)                                                 | Extra beyond the strip (px)       |
| ------------------------- | --------------------- | ------------------- | ----------- | --------------------------------------------------------- | --------------------------------- |
| 1024, none, mouse         | 402                   | 344 to 352          | 1 to 2      | 50 to 58                                                  | 0                                 |
| 1024, none, finger        | 278                   | 216                 | 1 to 2      | 62                                                        | 0                                 |
| 1024, flagged bar, mouse  | 266                   | 200 to 208          | 1 to 2      | 58 to 66                                                  | 0                                 |
| 1024, flagged bar, finger | 122                   | **52**              | 1 to 2      | 70                                                        | 0                                 |
| 1120 and 1250, bar, mouse | 406 to 526            | 340 to 508          | 1 to 2      | 58 to 66 (Diagram), 18 to 26 (Gantt)                      | 0 (Diagram), -40 (Gantt)          |
| 1280 to 1646, bar, mouse  | 506 to 899            | 448 to 805          | 1           | 58 (Diagram); Gantt 18 (1280), 58 (1440), 94 to 98 (1646) | 0 (Diagram); Gantt 1646: 36 to 40 |
| 1912, bar, mouse          | 866 to 882            | 768 to 832          | 1           | Diagram 94 to 98, Gantt 40 to 98                          | Diagram **36 to 40**              |
| 1440 to 1912, none, mouse | 702 to 899            | 652 to 889          | 1           | 10 to 50                                                  | -40 to 0                          |

On a finger at 1024 with a bar selected the stage falls to 68 (unflagged) and 52 (flagged) while the strip is up, against 138 and 122 without it;
amendment Q2 accepts exactly that, and the corner cluster is outside the stage there (the 52 px case). The finger readings at 1120 to 1912 follow the
mouse's pattern, 8 to 12 px taller per strip (62 against 50 with nothing selected, 66 to 70 against 58 with a bar). The Gantt's and the Diagram's costs differ by
up to 40 px (mouse) and 48 px (finger) in most selection cells, and by 58 px (mouse) at 1912 with the flagged bar: that last one is rule 4.

## Verdict per stop rule

| Stop rule (amendment section 4)                                                                                          | Verdict                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. In any fine-pointer cell a variant takes more than two lines (three for link plus offer), or a button is not self-hit | **FIRES at 200 % text. HOLDS at 100 %.**                                                                                                                                                                                                        |
| 2. At 1120 to 1250 fine with a selection, the strip costs more than its own lines (ADR-0187 D3's 40 px returning)        | **HOLDS.** Extra is 0 px in the Diagram and -40 px in the Gantt in all 40 option A readings; the alternative rule was worse and is not needed. **But** see rule 4: the same cost returns at 1646 and 1912, outside this rule's window.          |
| 3. With nothing selected, the stage drops below 120 px in any cell at or above 1024 x 600                                | **HOLDS at 100 %** (minimum 344 mouse, 216 finger). **FIRES at 200 % by the root-font-size route** (stage 0 for link plus offer and 107 for the long name, both pointers). **Holds by the browser-setting route** (minimum 291, both pointers). |
| 4. Any Gantt cell differs from its Diagram cell by more than the strip's own height                                      | **FIRES.** Mouse, 1912 x 1080, flagged bar selected: the offer costs the Diagram 98 px and the Gantt 40 px, a 58 px difference against a 50 px strip (`edit-one`, `edit-several`, `plan`).                                                      |

**Rule 1, the evidence.** At 100 % text no cell on either pointer, in either view, exceeded 2 lines (link plus offer: 2), missed a button's own hit,
scrolled sideways, put a button past an edge or overlapped a neighbour, in 420 readings. At 200 %, root-font-size route: strips of 4, 7, 6, 4 and 11
lines (`edit-one`, long name, several, plan, link plus offer) and no button self-hit with nothing selected (`clipped`: past the window's bottom edge or
the foot row's right edge; the cause was not investigated, and the shipped band at 200 % was not read to see whether the base state clips too).
Browser-setting route: strips of 2, 3, 3, 2 and 4 lines, so the long name (3 against a limit of 2) and link plus offer (4 against 3) exceed, again with no
button self-hit with nothing selected, and every button self-hit with a bar selected. Both pointers read the same lines. The 200 % base state is
already tight with a selection (stage 109 and 69 px on a mouse by the first route, 253 and 213 by the second), so the offer is added to a cell that is
already near the floor.

**Rule 4, the evidence and its context.** Mouse at 1912, `Pour slab` selected: Diagram foot 67 to 165 (the strip sits below the selection bar,
`belowSelectionBar` true, and the plan facts take a line of their own), Gantt 67 to 107 (the strip shares the selection bar's line,
`belowSelectionBar` false). The same extra appears at 1912 in the Diagram for `Excavate` (foot 51 to 145, extra 36) and in the Gantt at 1646 and 1912 (extra 36
to 44 on both pointers). Rule 2's window, 1120 to 1250, is where the Diagram's extra is zero because the line the facts gain is offset by the line the
selection bar loses (3 to 2 lines) once it has the full row. Compared by raw foot height rather than by cost, rule 4 also fires on a finger at 1912
(Gantt 113, Diagram 181, strip 62). The amendment's sentence "on a wide screen like yours (1646 or 1912) nothing changes" holds with nothing selected
(+10 mouse, +18 finger) and does not hold with a bar selected.

**Not measured, so not claimed.** A classic (non-overlay) scrollbar; a real Surface Pro; the product's own `Follow logic` buttons and offer strip (none
exist); the shipped band at 200 % text; the Gantt at 200 %; the Link tool beside a strip in the Gantt; the alternative rule at 1646 and 1912; why the
live Linked band's outlet was 731 px at 1024 while the injected clone's was 347.5 (see below).

## The three existing foot messages with long names (Q3)

The strips as shipped use `NoticeStrip`'s default `truncate` fit and compact density. **Does `truncate` engage?** No: in the 47 of 84 shipped-strip
readings where the strip is wider than its outlet, `textTruncated` is `false` in all 47, and the strip keeps its natural width (`minWidth: auto`).
**With `min-w-0` injected on the strip, in all 47 of those readings the strip narrows to the outlet, the ellipsis engages (`textTruncated` true,
`minWidth: 0px`), nothing overflows and every button is hit.** So the design review's suspicion is correct and sufficient in these cells; that is a
measurement of an injected style, not a claim about every strip.

Mouse, nothing selected, outlet 347.5 px at 1024 (hit means a pointer at the button's centre hits the button):

| Message (natural width)         | Shipped at 1024                                      | Still overflowing at (px over)                                         | With `min-w-0`                                          | With option A (cost)                        |
| ------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| Linked band, 2 long names (771) | 423 px over, Undo not hit, foot row scrolls sideways | 1120 (327), 1250 (197), 1280 (167), 1440 (7); Undo not hit up to 1280  | 0 over, Undo hit; 252 of 675 px of the sentence visible | 1 to 2 lines, hit: +58 at 1024, +10 at 1646 |
| Undo result (592)               | 245 px over, both buttons not hit                    | 1120 (149), 1250 (19); both hit again from 1250                        | 0 over, both hit; 167 of 411 px visible                 | 1 line, hit: +50 at 1024, +10 at 1646       |
| Layout-resolved notice (823)    | 475 px over, both not hit, foot row scrolls sideways | 1120 (379), 1250 (249), 1280 (219), 1440 (59); Dismiss not hit at 1440 | 0 over, both hit; 166 of 641 px visible                 | 1 to 2 lines, hit: +58 at 1024              |

With a flagged bar selected on a mouse the outlet is the same 347.5 px and the overflow is the same, but the buttons are hit (the strip sits on its own
line under the bar) and the foot row scrolls sideways for the Linked band and the layout notice at 1024. On a finger with a bar selected at 1024 the
outlet is 731 px (the bar is `data-dock-wide`); the Linked band overflows it by 40 px and the layout-resolved notice by 92 px (Dismiss not hit), with the
stage already at 56 px. **The live Linked band** (the Link tool actually armed, long names, nothing selected) read: 1024 mouse, outlet 731, strip 771,
overflow 40, Undo clipped, foot row scrolling sideways; 1120, outlet 443.5, overflow 327, Undo not hit; 1440, overflow 7; 1912, none (the finger run is within
4 px of each). **So the docblock claim at `notice-strip.tsx:59-62` (that `truncate` "keeps a one-line mode statement from pushing its Undo button off a
narrow canvas") is contradicted by these readings** for the strip as shipped, and made true by the injected `min-w-0`. The live outlet at 1024 was 731
px against the clone's 347.5; that difference was not investigated (the live reading was taken with the tool armed), and the overflow and the
unpressable or clipped Undo are present in both.

**For Q3's row.** Two one-line fixes have evidence behind them: `data-dock-row` on the strip (option A's mechanism: the full sentence, a line of height
while the message is up, +50 to +66 at 1024 and +10 to +18 at 1646 and wider) or `min-w-0` on the strip (no added height; at 1024 the sentence is cut to
about a quarter to two fifths of its width). Choosing between them is that row's job. The TECH_DEBT row is **not** filed from this pass because a stop
rule fired (below), and the brief says to change only the amendment's status line in that case.

## What this means for the amendment

Stop rules 1, 3 (one route) and 4 fired, so per the amendment's own words it **returns to the owner with option B as the fallback**, and nothing is
folded into the spec, the plan, ADR-0216's draft or `docs/TECH_DEBT.md`. Findings the owner's decision needs, each with its reading:

- **Rule 4 and the wide-screen cost.** With a bar selected on a mouse the offer costs 94 to 98 px in the Diagram at 1912 and in the Gantt at 1646 and 1912,
  where the strip's own height is 50; the extra 36 to 40 px is the plan facts taking a line of their own. Rule 2 was written for 1120 to 1250 and holds
  there; the same cost at 1646 to 1912 was asked about by no rule and is wider than the amendment says. The alternative rule (no marker when a selection
  bar is in the outlet) was worse at 1120 and 1250 and was not read at 1646 or 1912.
- **200 % text.** At 1024 x 600 the offer is 2 to 4 lines by the browser-setting route and 4 to 11 by the root-font-size route, and with nothing selected
  its buttons were past the window's edge. The amendment's cell list asked for this reading and rules 1 and 3 count it.
- **The 100 % picture is good.** If the owner wants the 200 % cell and the 1912 mouse-with-selection cell judged acceptable costs, or the stop rules
  reworded, the readings above are what that decision is made on. This pass does not make it.

## M1 reading (2026-11-11)

The rename (`Clear visual start` to `Follow logic`, label only) is built. Command, run from the worktree with `NODE_OPTIONS=--max-old-space-size=8192
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`:

`scripts/e2e-local.sh web:workspace-chrome` — **47 passed**, including every `dock.spec.ts` case. Its foot-row equality at 1646 × 1097 (the check M0 did not
measure) **did not move**: the asserted figure is unchanged, so no value in the spec was edited and there is no old/new pair to record. The label is
narrower (C14: 146 to 113.8 px fine, 154 to 121.8 px coarse), and at 1646 the bar still fits one row, as it did before.

`scripts/e2e-local.sh web:gantt-editing` — **53 passed**, including `object-actions-reach.spec.ts` with the renamed locator.

C14's 1912 touch figure (the bar going from two lines to one, foot row −48 px) is M0's reading and is recorded here as the one a reader of
`dock.spec.ts` should know about: no gated assertion sits at 1912 touch, so no journey measures it, and M1 did not re-take it.

## M0c reading (2026-11-11)

- **What this pass asks:** amendment 2's revised design, option A′ ([`amendment-2-after-m0b.md`](./amendment-2-after-m0b.md) §2–§3), against its five stop
  rules S1–S5, each judged against the same cell's own base state.
- **Probe:** `apps/web/measure-toolbar/follow-logic-m0c-offer-row.spec.ts`, run by the existing `measure:toolbar` target. The judge that applies the
  rules is `apps/web/measure-toolbar/follow-logic-m0c-judge.mjs` (prints, never gates). A harness, not a gate (ADR-0081 section 3): no new Playwright
  config, no CI step, **nothing under `apps/web/src` or `apps/api/src` changed**. Tree: `origin/main` at web 1.1.3 (the `min-w-0` fix, #579, is in it).
- **Raw readings:** [`readings/follow-logic-m0c-offer-row.fine.json`](./readings/follow-logic-m0c-offer-row.fine.json) and
  [`.coarse.json`](./readings/follow-logic-m0c-offer-row.coarse.json): every cell, every state, with the sentences the product produced.
- **Commands** (from the worktree root; each pointer is one test in the file; the runs these figures come from reported `1 passed (5.4m)` and
  `1 passed (4.6m)`):

  ```text
  export NODE_OPTIONS=--max-old-space-size=8192 PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
  scripts/e2e-local.sh measure:toolbar -- follow-logic-m0c-offer-row.spec.ts --grep fine
  scripts/e2e-local.sh measure:toolbar -- follow-logic-m0c-offer-row.spec.ts --grep coarse
  node apps/web/measure-toolbar/follow-logic-m0c-judge.mjs docs/specs/placed-bar-follows-link/readings   # every verdict and table below
  ```

  The probe writes JSON to `apps/web/measure-output/` (git-ignored); the files in `readings/` are copies.

- **Discarded runs, and why.** Two earlier runs of the same file were discarded for probe faults, fixed before the run reported here; each reported
  `1 passed` per pointer, which says the test ran and not that its readings were sound. **Run 1 (fine only):** the Gantt at 200 % failed (`selection would not clear in gantt`: the Gantt's selection cannot
  be cleared once made, so its 200 % read had to ride the same selection-major pass as its 100 % read); the "widest facts" injection rewrote the
  schedule-state sentence and never put it back, so later "real stale" readings carried the injected 677 px (visible as `facts.w` 677.1 in cells labelled
  `stale-real`); and R0's controlled comparison and its 100 ms series did not exist yet. **Run 2 (both pointers):** complete, but it had no `grow-floor`
  mode, which is the only way to read "`grow` under the A-prime outlet floor" (row 580), so the multi-select bar's answer under the floor would have been
  a guess. The judge's verdict lines and the 1024 message rows of run 2 agree with the final run's in every cell I compared (S2 fires at 1250 only, 40 px, both
  views). In run 1 the first live read at 1024 happened to find the schedule already `current` (outlet 347.5), which is why R0's timing read is
  discussed below.

### Summary, in plain English

**One of the five tests fails, so the revised design is not folded into the spec, and this goes back to you with option B as the fallback the amendment
names.** On an ordinary mouse, in a window about 1210 to 1250 pixels wide, with a bar selected, the new message makes the bottom bar 40 pixels
taller than it needs to be. That is the same 40 pixels the selection bar was refused in an earlier decision. It is the single place it happens (the
width sweep reads every 10 px from 1150 to 1330, and only 1210, 1220, 1230, 1240 and 1250 are affected; on a finger no width is affected). The cause
is plain and narrow: the revised rule asks the message's space for 36 rem, and in that band 36 rem leaves just enough room beside the plan facts but not
enough for the "Expand" button as well, so the button drops onto a line of its own. Everything else passes. At normal text size every button is
pressable, nothing scrolls sideways, the message never takes more than two lines of words (three for the link-plus-offer sentence, which is its limit),
and with nothing selected the diagram keeps at least 344 pixels on a mouse and 216 on a finger. At double text size every button can be reached by
scrolling, nothing scrolls sideways, and with nothing selected the diagram keeps at least 219 pixels on a mouse and 195 on a finger; the message is 2 lines and about 200 pixels tall
(M0b read 4 to 11 lines and 474 pixels). **The "buttons not pressable at double size" finding of the last pass was the measuring tool**: the shell
already scrolls at that size and the foot bar, with its own Expand button, sits below the window before any message exists; the Expand button is not
pressable in place either and is pressable after scrolling, exactly like every message button. **The odd 731-against-347.5 reading is explained**: it is
the same message on a line of its own, and it happens while the bar's "Recalculating…" or "Recalculate" part is showing, which makes the plan facts
too wide to share a line with the message. The same pass measured the three existing foot messages and the multi-select bar for row 580: the
revised layout (own row, buttons dropped under the sentence) shows the whole sentence on all four without hover and costs the diagram nothing on the
multi-select bar; the other candidate, letting the sentence grow, turns the multi-select bar into a 14-line column and is rejected.

### What was injected, stated plainly

Nothing in the product was changed. Every strip is a clone of the real `NoticeStrip` the running page rendered (now carrying the shipped `min-w-0`),
captured from a real Link-tool link between two real bars (or, for the undo result, a real Ctrl+Z), with its sentence and buttons replaced and put into
the real dock outlet. **A-prime** is exactly what amendment 2 §3 gives: its four-rule stylesheet, verbatim (`RULES_CSS` in the probe: the outlet's
36 rem floor on `:not(:empty):has([data-dock-row])`; `min-width: 0` and `flex-wrap: wrap` on the strip; the sentence `flex: 1 1 0%` with
`min-width: min(16rem, 100%)`; the action group at the trailing edge with its own wrap), `data-dock-row` on the strip, comfortable density
(`items-start py-2` in place of `items-center justify-between py-1.5`), the sentence's class `flex-1`, and the buttons moved into one
`<div data-dock-row-actions>`. **Product order:** in the Diagram the link-plus-offer face (and the bare Linked band) is inserted **before** the selection
bar's element in the outlet (`TsldPanel.tsx:3327` against `:3338`), and every other face is appended; in the Gantt every face is appended. M0b appended
all of them. **Not the product:** the offer's sentences and button labels (the spec's draft), the layout-resolved notice (the Linked band's HTML, which has
the same classes as `LayoutResolvedStrip`, carrying `sentenceFor`'s one-bar sentence), and that nothing is wired to anything. The multi-select bar is the
real one (a real Shift+ArrowDown selection), reshaped in place and put back. **Two extra rules were read for row 580 only:** `grow` (sentence `flex-1`,
comfortable density) and `grow-floor` (`grow` plus only the outlet's 36 rem floor, no wrap and no action group).

Fixture, as M0b: a new account on a real API and Postgres, real Chromium 156 in this container (ADR-0128: every pixel figure is from here and not from the
Surface Pro). `Excavate` and `Pour slab` (linked through the API, `Pour slab` placed on 6 Jan so it is flagged `EARLIER_THAN_LOGIC`), two 46-character
names linked with the Link tool, and the undo result from a real Ctrl+Z (`Undid add “Commission the rooftop plant and chilled water loop”.`).
**R3's widened facts:** an activity created through the API after the last calculation and a page reload give the real stale state ("Edited since it
was last calculated" plus **Recalculate**, `data-schedule-state="stale"`, facts 627.1 px wide against 327.5 when current), and the widest honest
sentence ("Could not calculate — 12 edits still pending", 677.1 px) is put in by text and put back after each cell. R3 is mouse only, as the amendment words it.

### What was read

Cells: 1024 × 600, 1120 × 700, 1250 × 800, 1280 × 800, 1440 × 900, 1646 × 1097, 1912 × 1080; a mouse (`fine`) and a finger (`coarse`, `hasTouch`; the
pointer type is read back in every reading); nothing selected, `Excavate` selected, `Pour slab` selected (flagged); the Diagram and the Gantt; the five
variants of the amendment. **R2:** 105 A′ readings per view per pointer, 420 in all. **R3:** 1024, 1280 and 1440, mouse, three selection states, five
variants, two facts states: 90 A′ readings. **R1 and R4:** 1024 × 600 at 200 % by the root font size (selection made at 100 % first, because the list cannot
take focus after) and by `Page.setFontSizes` (what a browser's own text size does; it moves the rem media queries), both pointers, three selection states;
and, new in this pass, the **Gantt at 200 %** by the root font size (selection-major, as at 100 %). Per cell: the base reading, the three shipped strips
(Linked band, undo result, layout-resolved) and the five A′ variants, 135 strip readings per pointer. **Per reading, new in this pass:** the facts' `data-schedule-state` and
width; the shell scroller's `scrollTop`, `scrollHeight`, `clientHeight` and whether `squat` is engaged (its computed `overflow-y` is `auto`); the
outlet's computed `min-width`; for every strip button and for the foot row's own Expand toggle, `selfHit` in place **and** after
`scrollIntoView({ block: 'nearest' })` (every scrollable ancestor's offset is put back afterwards); the sentence's lines, whether it is cut, and
whether the buttons dropped under it. Extra is cost − strip height − 8 px when the strip and the selection bar do not share a line, as M0b defined it.
**S2's width sweep** (new, because S2 fired): 1150 to 1330 in 10 px steps at height 800, both pointers, both bar-selected states, the base and `edit-one`.

### Verdict per stop rule

| Rule                                                                                                                                                                   | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 (100 %): a strip button not self-hit after `scrollIntoView`, or a sideways scroll the base lacks                                                                    | **HOLDS.** 1,122 strip buttons (660 mouse, 462 finger) across the Diagram, the Gantt and R3's widened facts: every one self-hit after scrolling. No reading adds a sideways scroll to the foot row, the page or the shell that its base lacks.                                                                                                                                                                                                                                                                                                                                                                                          |
| S2 (100 %): extra above 4 px, any cell, both views, both facts states                                                                                                  | **FIRES.** Decided by: **mouse, 1250 × 800, either bar selected, Diagram and Gantt, all five variants: extra +40 px** (`edit-one`: foot 253 against a base of 147, strip 58, gap 8). 20 of the 300 mouse readings; the other 280 are between −120 and 0. The 10 px sweep puts the band at **1210 to 1250** (1200 and 1260 hold, both selections); on a finger **no** reading exceeds 0 (−44 to 0) and the sweep is 0 throughout. R3's widened facts hold (−120 to 0).                                                                                                                                                                   |
| S3 (100 %): nothing selected, stage below 120 px                                                                                                                       | **HOLDS.** Minimum stage with nothing selected 344 px on a mouse (1024 × 600; base 402) and 216 px on a finger (base 278), in both views and with the widened facts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| S4 (100 %): the sentence takes more than 2 lines (3 for link-plus-offer)                                                                                               | **HOLDS.** Maximum 2 lines for `edit-one`, `edit-one-long-name` and `edit-several`; `plan` 1 (mouse) and 2 (finger); link-plus-offer 3, at 1250 and 1280 on both pointers: it sits exactly at its limit.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| S5 (200 %, either route): button not self-hit after scrolling where the base's toggle is, new sideways scroll, stage < 120 with nothing selected where the base is not | **HOLDS.** 90 A′ readings (root font, browser setting and Gantt root font, three selections, two pointers). Every strip button is self-hit after scrolling (the base toggle is too, in every cell); 0 of 27 readings per list has any sideways scroll. With nothing selected the stage is 219 (root font, mouse; finger 195) and 283 to 371 (browser setting; finger 259 to 363), against bases of 421 and 485. **Line counts at 200 % are reported, not judged:** 2 lines and 202 px (mouse; finger 226 px) at the root-font route for every variant; 1 to 2 lines and 114 to 202 px (finger 122 to 226) at the browser-setting route. |

**S2's cause, from the readings.** In the band the base's outlet is 533 to 573 px wide beside the facts, with a 3-line selection bar. A′'s floor makes
the outlet at least 576 px, which still fits beside the facts (outlet 581.5 to 621.5) and does not leave room for the foot row's Expand toggle (40 × 40),
which wraps onto a line of its own: toggle top 756 against 708 in the base at 1250, and 675 at 1260 where it fits beside the outlet; the foot row is
253 px at 1250 and 213 at 1260 with the same strip, 40 px, the toggle's own height. Below 1210 the outlet
takes a line of its own (907 px at 1200) and the bar goes from 3 lines to 2, which pays for the facts' line; above 1260 everything fits. The band is
the width where the floor, the facts, the gaps and the toggle first cannot all share one line. That a floor at any other value leaves a band of the same
kind is an inference from this arithmetic, **not measured**: no other floor was read.

**Decision per amendment 2 §3.** S3 and S4 did not fire, so the single 20 rem re-read is not allowed and was not taken. S2 fired: "S1, S2 or S5 fires and
R1 shows the base state passing the same test: abandon A′ for **B** and return to the owner." R1's control (below) concerns S1 and S5, which hold; S2's
base cannot "pass the test" because the base has no strip. **Nothing is folded into the spec, the plan, the amendments' status lines, ADR-0216's draft
or `docs/TECH_DEBT.md`.** Findings the owner's decision needs are in "What this means for amendment 2".

### R0: why the live outlet was 731 px and the clone's 347.5

**It is the same outlet on a line of its own, and the schedule-state region is what pushes it there.** Readings, `apps/web/measure-output` copy in
`readings/follow-logic-m0c-offer-row.fine.json`, keys `r0` and `r0Controlled`:

| Reading (mouse, 1024 × 600)                                                                          | `data-schedule-state` | Facts width | Outlet width | Foot row |
| ---------------------------------------------------------------------------------------------------- | --------------------- | ----------- | ------------ | -------- |
| Live Linked band at 1646, right after the link                                                       | `stale`               | 562         | 735          | 57       |
| Live Linked band, **0.5 s after the resize** (M0b read here)                                         | `recalculating`       | **438**     | **731**      | **97**   |
| Live Linked band, 3.5 s after the resize                                                             | `current`             | 327.5       | **347.5**    | 57       |
| Live Linked band, when a recalculate was requested (by the API: no button was showing) and 3 s later | `current`             | 327.5       | 347.5        | 57       |
| Clone of the Linked band, stale facts (real stale state, API edit and reload)                        | `stale`               | 627.1       | **731**      | **97**   |
| Same clone, after the real **Recalculate** button                                                    | `current`             | 327.5       | **347.5**    | **57**   |

The last two rows change one thing, the facts' state, and reproduce both M0b numbers (731 with a 97 px foot row, 347.5 with 57). **Arithmetic:** at
1024 the foot row's content is 731 px. The current facts (327.5), the toggle and two gaps leave the outlet 347.5, so the toggle and gaps are 56 px;
the outlet's own floor is 288 px. The outlet therefore wraps onto its own line whenever the facts exceed 731 − 288 − 56 = **387 px**. The
`Recalculating…` region (facts 438) and the stale sentence plus **Recalculate** (562 to 677) both exceed it; the current state (327.5) does not. M0b's two 1024
live readings were the first read after an edit, 400 to 500 ms after a resize, and in this run the first such read caught `recalculating`; in discarded run 1 it
had already settled to `current`, so whether the 731 px is seen depends on timing, which is the point. A Ctrl+Z sampled every 100 ms for 6 s at 1024
(57 samples) stayed `current` at 347.5 throughout: undoing the link did not make the schedule stale in this run, so that series does not reproduce the
window; the controlled pair and the 0.5 s read do. **The amendment's expectation holds:** the region is present in the first read (outlet 731) and gone
in the later one (347.5).

### R1: the control at 200 %

**Is the base dock already unreachable at 200 %? In place, yes; after scrolling, no: it is exactly as reachable as the strip's buttons.**

| Route, pointer, selection        | Foot row's Expand toggle in place | After `scrollIntoView` | Toggle top (window 600) | Shell `scrollTop` of `scrollHeight`/`clientHeight` |
| -------------------------------- | --------------------------------- | ---------------------- | ----------------------- | -------------------------------------------------- |
| Root font, mouse, all 3          | not hit                           | **hit**                | 1219                    | 0 of 1307/600 (`squat` engaged)                    |
| Root font, finger, all 3         | not hit                           | **hit**                | 1439 to 1522            | 0 of 1531/600                                      |
| Browser setting, mouse, none     | not hit                           | **hit**                | 795                     | 0 of 883/600                                       |
| Browser setting, mouse, selected | hit                               | hit                    | 512                     | 283 of 883/600 (focus scrolled the shell)          |
| Gantt, root font, mouse, all 3   | not hit                           | **hit**                | 1219                    | 0 of 1307/600                                      |

For the **shipped** strips (Linked band, undo result, layout-resolved; `min-w-0` now in place), root-font route: **0 of 15 buttons hit in place, 15 of 15 hit
after scrolling**, both pointers and the Gantt; browser-setting route: 10 of 15 in place, 15 of 15 after. That is the dock's own behaviour at 200 %: the
shell's one scroller (`app-shell.tsx:160`, `squat`) puts the foot row below the fold, and the same is true of A′'s buttons. **M0b's rule 1 "buttons
not pressable, clipped, with nothing selected" is therefore the instrument** (its `elementFromPoint` returns `null` for a point below the window and its
`clipped` counted `bottom > innerHeight`), as amendment 2 §1 said; the shell has no 1.4.4 defect here that predates this epic, and no separate register
row is raised. **Pre-existing and worth knowing:** with a bar selected at 200 % by the root font the base stage is already 109 and 69 px on a mouse (0
on a finger), below the 120 px guard, before any strip.

### Row 580: the existing foot messages and the multi-select bar

Measured at 1024 × 600 with the long names, mouse, in product order; "cost" is the foot row's growth against the same cell's base; "cut" is whether the
sentence is ellipsised (so unreadable without hover). The same table for the finger and for 1280 and 1646 is in the readings (`messages`).

| Message (cell)                           | Shipped (`min-w-0`, today)        | A′ own row (marker, wrap, group)                                                          | `grow` + comfortable                                | `grow` under the A′ outlet floor              |
| ---------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Linked band, nothing selected            | cut; +6 px                        | whole sentence, 2 lines; **+58**, stage 344 of 402                                        | whole, 3 lines; +38, stage 364                      | as A′ (outlet 731)                            |
| Linked band, flagged bar selected        | cut; +54                          | whole, 2 lines; **+26**, stage 240 of 266                                                 | whole, 3 lines; +86, stage 180                      | as A′                                         |
| Undo result, nothing / bar               | cut; +6 / +54                     | whole, 1 line; **+50 / +18**, stage 352 / 248                                             | whole, 3 lines; +38 / +86                           | as A′                                         |
| Layout-resolved, nothing / bar           | cut; +6 / +54                     | whole, 2 lines; **+58 / +26**, stage 344 / 240                                            | whole, **5 lines**; +78 / **+126**, stage 324 / 140 | as A′                                         |
| Multi-select bar (2 long names selected) | count kept, name cut; 194 px tall | **whole sentence, buttons dropped under it; 122 px tall, −32 px (stage 280 against 248)** | **14 lines, 298 px tall; +104, stage 144**          | **14 lines, 298 px; +144, stage 104 (< 120)** |

**Confirmed, not overturned:** `grow` makes the multi-select bar a tall narrow column: the sentence is a **65 px** column (as M0-follow-up recorded) and reads
14 lines in a 298 px strip (shipped: 134 px of sentence, cut, strip 194 px; A′: 705 px of sentence, strip 122 px). It is not rescued by the A′ outlet floor: `grow-floor` still reads 14 lines, and
costs more (+144 px, stage 104, under the 120 px guard on a mouse at 100 % text), because the floor gives the outlet room but the bar's action group is
not wrapping, so the sentence is still the squeezed item. What fixes it is A′'s wrap and grouped actions, not the floor and not `grow`. On a finger at 1024
with the flagged bar the stage is 52 to 56 in every mode (base 122), because the outlet is already on its own line there and the stage is already short;
that is the cell amendment 1's Q2 accepted. All 156 message buttons (84 strip readings per pointer) are self-hit after scrolling, in every mode.

### What this means for row 580

**The own-row treatment (A′'s markup and wrap) is the remedy that keeps the full sentence visible without hover on all four messages**, at a cost of
18 to 58 px of foot row on a mouse at 1024 (stage 240 to 352, always above 120) and **less** than today's strip on the multi-select bar (−32 px). `grow` also
shows the sentence but costs 38 to 126 px on the three strips and turns the multi-select bar into 14 lines, so it is rejected. **But the own-row treatment
depends on the outlet floor, and the outlet floor is what S2 fires on at 1210 to 1250 on a mouse with a bar selected** (the existing messages
were read at 1024, 1280 and 1646 only, so whether they cost the same 40 px in that band was not measured, though the mechanism says they would). Row 580's
Next is therefore **not edited** in this pass: which remedy, and whether it is built with M2 or as its own row, waits on the owner's decision about A′'s floor.

### What this means for amendment 2

- **S2 fired, so A′ as written does not pass.** The defect is in the outlet rule, as the amendment's own decision rule words it, not in the strip or the sentence:
  the strip, its wrap, the sentence floor and the grouped buttons all measured as intended (S1, S3, S4, S5 hold; the strip is 2 lines and about 200 px at 200 %
  where M0b's was 474; at 1912 with a bar selected the cost is 58 px, strip 50 + gap 8, extra 0, where option A cost 98). Option B (a compact trigger with a
  `Menu` at narrow widths) is the amendment's named fallback; option C is never the fallback. Amendment 2 says what the fallback is and not what a narrower
  floor would do, so a different floor was **not** read: that choice is the owner's, and a re-read at another floor is a separate approval.
- **Claims in amendment 2 the readings confirm:** the 731 against 347.5 explanation (§1); the "mostly the instrument" reading of the 200 % self-hit (§1,
  rule 1); the cost at 1912 with a bar selected falling from 98 to 58 (§2, "about 58, not 98", est.); the 200 % root route strip of "about 170" (it is 202 px,
  2 lines); the Gantt and Diagram now agree at 1912 (both 58, extra 0).
- **Claims the readings contradict or qualify.** (1) §2's "1120 to 1250 with a selection: … the same geometry as M0b, where extra was 0" is **false at 1250 and
  at 1210 to 1250 generally**: the floor fits beside the facts there and strands the toggle (extra +40, mouse, both views). (2) §3's R0 expectation "the outlet is
  about 347 px in the second read" holds (347.5), but its stated cause, "stale sentence plus **Recalculate**", is one of two: in the first read it was the
  **`Recalculating…`** region (438 px), and both exceed the 387 px threshold computed above. (3) The brief's "731 px vs 347.5 px **at 1024**": confirmed as
  the same element; no live-versus-clone difference exists. (4) The estimate "200 % root route link-plus-offer: about 2 text lines plus a 64 px button line,
  a strip of about 170 px" read 2 lines and 202 px; the stage with nothing selected is 219, so the criterion holds with less margin than estimated.
  (5) Pre-existing, unrelated to A′: at 200 % by the root font the base stage with a bar selected is already 109 and 69 px (mouse) and 0 (finger).

## M0d reading (2026-11-11)

- **What this pass asks:** [`amendment-3-after-m0c.md`](./amendment-3-after-m0c.md) §6: does option A″ (A′ plus one wrapper that keeps the plan facts and the foot
  row's toggle on one line by structure) hold stop rules S1–S7, each against the same cell's own base, S2 against the base with the group?
- **Probe and judge:** `apps/web/measure-toolbar/follow-logic-m0d-offer-row.spec.ts` (run by the existing `measure:toolbar` target) and
  `apps/web/measure-toolbar/follow-logic-m0d-judge.mjs` (prints, never gates; every verdict below is its output on the committed JSON). A harness, not a gate
  (ADR-0081 section 3): no new Playwright config, no CI step, **nothing under `apps/web/src` or `apps/api/src` changed**. Tree: `m0d-follow-logic`, which is
  `origin/main` (web 1.1.3) plus the M0c commits `048182a` and `ad130f0` and amendment 3.
- **Raw readings:** [`readings/follow-logic-m0d-offer-row.fine.json`](./readings/follow-logic-m0d-offer-row.fine.json) (1,259 readings) and
  [`.coarse.json`](./readings/follow-logic-m0d-offer-row.coarse.json) (987), one flat `readings` array each, every reading tagged with its `set`, `view`, `cell`,
  `selection`, `mode` and (where it applies) `variant`, `factsVariant` and `message`.
- **Commands** (from the worktree root; each pointer is one test, reported `1 passed (9.5m)` and `1 passed (7.5m)`):

  ```text
  export NODE_OPTIONS=--max-old-space-size=8192 PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
  scripts/e2e-local.sh measure:toolbar -- follow-logic-m0d-offer-row.spec.ts --grep fine
  scripts/e2e-local.sh measure:toolbar -- follow-logic-m0d-offer-row.spec.ts --grep coarse
  node apps/web/measure-toolbar/follow-logic-m0d-judge.mjs docs/specs/placed-bar-follows-link/readings   # every verdict and table below
  ```

  The probe writes JSON to `apps/web/measure-output/` (git-ignored); the files in `readings/` are copies. The judge also reads the two M0c files in the same
  directory, for S6's red-first check.

### Summary, in plain English

**None of the seven tests fails, so option A″ is folded into the spec, the plan and the decision record.** The one-line fix works: putting the plan facts and the
panel's Expand button into one group means the new message is either beside both or above both, and the button can no longer be left on a line of its own.
The cell that failed last time (1250 pixels wide, a mouse, a bar selected) now costs exactly the message's own height and nothing more (extra 0, where the
last pass read +40), and so does every one of the other 1,353 readings at normal text size on a mouse and a finger, in the Diagram and the Gantt, across all
five message wordings. Every button is pressable, nothing scrolls sideways, the message never takes more than two lines of words (three for the
link-plus-offer wording), with nothing selected the diagram keeps at least 344 pixels on a mouse and 216 on a finger, and at double text size every button can
be reached by scrolling and the diagram keeps at least 219 pixels (195 on a finger). The group alone, with no message at all, never makes the bottom bar taller;
in 49 of 352 cells it makes it **shorter**. **The new check for the very defect last time found (S6, "the button is on the facts' line") was first shown to catch
it:** it fires on M0c's own 1250-pixel readings and not on the 1260-pixel ones where the button fit.

**Two things you did not ask about came out of the same readings.** (1) **The bottom bar you have today already leaves its Expand button on a line of its own in some
states, and costs 48 to 120 pixels for it.** With a bar selected, on a mouse, while the bar says "Recalculating…" (windows about 1030 to 1070 wide) or shows the
"edited since it was calculated" sentence with its Recalculate button (about 1220 to 1260 wide); and, a case nobody predicted, **on a finger, with a bar selected, in
the ordinary up-to-date state, at about 1210 to 1250** (48 pixels in the Diagram, 96 in the Gantt). The group removes every one of these. That is a new register
row, #581, fixed by the same change. (2) The wording of the record that guided the foot bar's order ("the facts lead") is out of date; that is noted below for the
decision record and not edited here.

### What was injected, stated plainly

Nothing in the product was changed. Every strip is, as in M0c, a clone of the real `NoticeStrip` the running page rendered (carrying the shipped `min-w-0`), captured
from a real Link-tool link between two real bars (or a real Ctrl+Z), with its sentence and buttons replaced and put into the real dock outlet, in product order (the
link-plus-offer face and the bare Linked band before the selection bar in the Diagram; every other face appended; the Gantt appends all of them). **A-prime** is M0c's
stylesheet verbatim (`RULES_CSS`) plus `data-dock-row`, comfortable density and the buttons in one `data-dock-row-actions` group. **What M0d adds is amendment 3 §4,
exactly:** its stylesheet rule for `[data-activities-bar] > [data-foot-trail]` verbatim (`TRAIL_CSS`), and the group itself, **built in the page**: a new
`<div data-foot-trail>` is put where the facts' outlet is, and the facts' outlet and the foot row's toggle are moved under it, in their DOM order. **It is undone, nodes
put back and the element removed, straight after every reading** (`groupOff`, in a `finally`), so no view switch, panel expand or collapse, reload, route change or
selection change ever happens while it is in place; the probe throws if the group is already in place when it is asked to build one. Each reading records `grouped`
and the judge checks it against the mode (0 mismatches in 2,246 readings). Three foot-row modes are read in every cell: `base` (the shipped dock),
`base-grouped` (the shipped dock plus the group only; S2's baseline and S7's subject) and `A-double-prime` (A-prime's strip plus the group); the row 580 messages also
read `shipped` (the product's own strip, no group) and `own-row` (A-prime's markup on the strip, plus the group).

**Not the product:** the offer's sentences and button labels (the spec's draft), the layout-resolved notice (the Linked band's HTML, which has the same classes as
`LayoutResolvedStrip`), and that nothing is wired to anything. The multi-select bar is the real one (a real Shift+ArrowDown selection), reshaped in place and put back.
Fixture, as M0c: a new account on a real API and Postgres, real Chromium in this container (ADR-0128: every pixel figure is from here and not from the Surface Pro).
**Wide facts, three real states:** (a) the stale state is real (an activity created through the API after the last calculation and a reload: "Edited since it was last
calculated" plus **Recalculate**, `data-schedule-state="stale"`, facts 627.1 px against 327.5 current); (b) the widest honest sentence ("Could not calculate — 12 edits
still pending", 677.1 px) is put in by text and put back after each cell; (c) **"Recalculating…" is real and held**: the Recalculate button is pressed with the
`**/schedule/recalculate` request held by `page.route` until the readings are taken (`data-schedule-state="recalculating"`, facts 438 px; the judge confirms the state in
all 96 held readings, and `stale` in all 176 R3s readings), and the plan is then allowed to settle.

### What was read

Mouse (`fine`) and finger (`coarse`, `hasTouch`; the pointer type is read back in every reading and the judge confirms it). Per cell the base, the base with the group and
each variant as A″.

| Set                                          | Cells                                                                                                                                                                                                              | Readings, fine / coarse |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Sweep (`sweep`)                              | 1150 to 1330 in 10 px steps × 800 high; `Excavate` (placed, unflagged) and `Pour slab` (flagged) selected; **Diagram and Gantt; all five variants**                                                                | 532 / 532               |
| Regression grid (`grid`)                     | 1024 × 600, 1120 × 700, 1280 × 800, 1440 × 900, 1646 × 1097, 1912 × 1080; nothing selected and both bars; Diagram and Gantt; five variants                                                                         | 252 / 252               |
| Wide facts (`r3s`, mouse only)               | 1024 × 600 and 1200, 1210 … 1270, 1280, 1440 × 800; nothing selected and the flagged bar; real stale and the widest sentence; `edit-one` and link-plus-offer                                                       | 176 / none              |
| Held "Recalculating…" (`held`)               | 1024 to 1090 in 6 px steps × 800; both bars; `edit-one` and link-plus-offer (mouse only)                                                                                                                           | 96 / none               |
| Row 580 messages (`messages`)                | 1024 × 600, 1210 to 1250 in 10 px steps, 1280 × 800; nothing selected, the flagged bar, and the real two-name multi-select bar; the three strips shipped and as own-row; the multi-select bar shipped and reshaped | 140 / 140               |
| 200 % (`text200-root`, `-browser`, `-gantt`) | 1024 × 600, root font size, browser text setting (`Page.setFontSizes`), and the Gantt by the root font; three selections; five variants                                                                            | 63 / 63                 |

### Verdict per stop rule

Judged by `follow-logic-m0d-judge.mjs`; "readings judged" is the number the rule was applied to (both pointers together).

| Rule                                                                                                                               | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 (100 %): a strip button not self-hit after `scrollIntoView`, or a sideways scroll the base lacks                                | **HOLDS.** 1,354 readings (745 fine, 609 coarse). 1,663 strip buttons on a mouse and 1,323 on a finger: every one self-hit after scrolling **and in place**; no reading adds a sideways scroll; the foot row's toggle is self-hit in every one of the 1,354. Deciding cell: none fires; the cell M0c's S1 was nearest to is any 200 % cell, which is S5's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| S2 (100 %, every cell): `extra > 4 px`, `extra = cost − expected`, cost against `base-grouped`, `expected` as amendment 3 words it | **HOLDS.** 1,354 readings. Extra ranges **−80 to 0** on a mouse (560 readings at exactly 0, 185 below, none between 0 and 4) and **−40 to 0** on a finger (602 at 0, 7 below). **The cell M0c's S2 fired on, 1250 × 800, a bar selected, Diagram and Gantt, all five variants, now reads extra 0 in the Diagram on both pointers, and −40 (mouse) or 0 (finger) in the Gantt:** `edit-one`, flagged bar, Diagram: foot 205 against base-grouped 147, strip 50, gap 8, 205 − 147 − 58 = 0 (M0c's A′: 253). The 10 px sweep from 1150 to 1330 is **0 at every width, both selections, in the Diagram on both pointers and in the Gantt on a finger**, and in the Gantt on a mouse −40 from 1150 to 1250 and 0 from 1260. Deciding (nearest) cell: the largest value is 0, first at fine grid 1024 × 600, nothing selected, `edit-one`. R3s, held "Recalculating…" and the widest sentence all hold (−80 to 0).                                                                                                                                               |
| S3 (100 %): nothing selected, stage below 120 px                                                                                   | **HOLDS.** 206 readings. Minimum stage with nothing selected **344 px on a mouse** (grid 1024 × 600, `edit-one-long-name`; its base 402) and **216 px on a finger** (grid 1024 × 600, `edit-one`; base 278). Identical to M0c's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| S4 (100 %): sentence over 2 lines (3 for link-plus-offer)                                                                          | **HOLDS.** 1,256 A″ readings. Maximum lines: `edit-one`, `edit-one-long-name`, `edit-several` and `plan` 2; link-plus-offer 3 (at its limit, both pointers, as in M0c).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| S5 (200 %, either route)                                                                                                           | **HOLDS.** 90 readings (root font, browser setting and Gantt root font; three selections; two pointers). 198 of 198 strip buttons self-hit after scrolling where the base toggle is; **0 of 90 readings has any sideways scroll**; minimum stage with nothing selected **219 px (mouse) and 195 (finger)** at the root-font route (bases 421) and 283 to 371 / 259 to 363 at the browser setting (bases 485), exactly as M0c. Line counts, reported: 2 lines and 202 px (finger 226) for every variant at the root-font route; 1 to 2 lines and 114 to 202 px (finger 122 to 226) at the browser setting.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **S6 (100 %): the toggle is not on the facts' line (centres more than half a line apart)**                                         | **HOLDS, and was shown red first.** 1,354 readings: the largest offset between the toggle's centre and the facts' is **0 px** (both pointers), and in 0 of the readings with the group and no strip (`base-grouped`) is it off. **Red first (ADR-0110):** the judge, run on M0c's own A′ readings at 1250 × 800, fires on **28 of 30** on each pointer (15 per view: three selections × five variants), e.g. Diagram, a bar selected, `edit-one`: toggle top 756 on a line of its own (M0c fine.json l. 39667). It fires on 18 of the 20 readings M0c's S2 flagged and on all ten with nothing selected, where M0c's S2 scored 0; the two it does not fire on are the Diagram's link-plus-offer with a bar selected, where the strip (before the bar, 3 lines) sits above the facts and the proxy below has no facts' line to compare with (their foot is 253 and 273 px, so the toggle is stranded there too). It fires on **0 of 2** at 1260 × 800, where the toggle fitted. See "How S6 was made red first" below for the one thing M0c did not record. |
| S7 (100 %): the group alone makes any foot row taller, or adds sideways scroll                                                     | **HOLDS.** 352 `base-grouped` readings (210 fine, 142 coarse): **largest increase 0 px**, no new sideways scroll. The group makes the foot row **shorter** in 24 of 210 mouse cells (largest saving **120 px**: stale facts, 1220 × 800, the flagged bar) and 25 of 142 finger cells (largest **96 px**: Gantt, 1210 × 800, `Excavate`), equal in the other 186 and 117. Reported, not judged: the group moves the facts off the leading edge of their line in 15 of 210 mouse and 35 of 142 finger cells (the cells where the outlet takes a line of its own: e.g. Diagram 1024 × 600 with the flagged bar selected on a mouse; 1024 × 600 and 1120 × 700 with a bar selected on a finger).                                                                                                                                                                                                                                                                                                                                                               |

**How S6 was made red first, and its one limit.** M0c's readings carry the toggle's `top` but not the facts' `top`, so amendment 3's own test ("`toggle.top` differs from the
facts' line") cannot be run on them as written. The judge uses the amendment's own reading of l. 39667 instead: on M0c's A′ readings the strip sits beside the facts
(`aboveFacts` false), so the facts' line is the strip's, and the toggle is stranded when `toggle.top ≥ strip.bottom − 2`. That proxy fires on the defect and not on 1260. On
M0d's own readings the real rule runs, with the facts' outlet's `top` and height recorded in every reading (centres compared, tolerance half of the taller of the two).
The proxy's weakness is that it needs a strip, so it says nothing about M0c's base readings.

**What is not a surprise but is worth stating.** At 1250 × 800 A″ does not put the strip beside the facts: the 36 rem floor plus the 375.5 px group is 959.5 px against a
957 px row, so the outlet takes its own line and the group takes the one below (outlet 957, group 375.5 px at the trailing edge, foot 185 and 205 against base-grouped 127 and
147). That is amendment 3 §4's estimate ("A″'s geometry at 1210–1250 is 1200's"), now read.

### The shipped dock today: does it strand the toggle? **Yes, in three states, and one of them nobody predicted**

Amendment 3 §2 derived the first two; M0c's R3 read stale facts at 1024, 1280 and 1440 only, all outside the band. Read here, in the `base` mode (no strip, no group), on the
toggle's centre against the facts' centre, with a bar selected:

| State (mouse)                                      | Facts | Window widths stranded (10 px steps, or 6 px for "Recalculating…")                     | Foot row, shipped against the same dock grouped                                                               |
| -------------------------------------------------- | ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| "Recalculating…" held (real), either bar           | 438   | **1030 to 1072** (not at 1024; not at 1078 to 1090)                                    | 247 / 267 against 127 / 147 at 1030 to 1042 (**+120**); 207 / 227 against 127 / 147 at 1048 to 1072 (**+80**) |
| Real stale sentence plus Recalculate, flagged bar  | 627.1 | **1220 to 1260** (not at 1024, 1200, 1210, 1270, 1280, 1440)                           | 267 against 147 at 1220 and 1230 (**+120**); 227 against 147 at 1240 to 1260 (**+80**)                        |
| The widest honest sentence (injected), flagged bar | 677.1 | **1270 and 1280** (and, with **nothing selected**, 1024 × 600: 83 against 51, **+32**) | 267 against 147 (**+120**)                                                                                    |

The predicted bands were "about 1027 to 1075" and "about 1216 to 1264"; the readings are inside them to the sampling step. **The third case, not predicted:** on a **finger**,
with a bar selected, in the ordinary **current** state (facts 327.5 px), the toggle is stranded at **1210 to 1250** in the Diagram (foot 191 with `Excavate` and 207 with
`Pour slab`, against 143 and 159 grouped: **+48**) and in the Gantt (**+96**). The cause is §2's arithmetic at a different floor: a finger-sized window's selection bar already
asks the outlet for 36 rem (`canvas-dock.tsx:136`, `sm:pointer-coarse:has-[[data-dock-wide]]:min-w-[min(36rem,100%)]`), so the same band opens with the facts at their narrowest.
On a mouse with current facts nothing is stranded in the shipped dock outside 200 % text. (At 200 % by the root font the shipped dock reads the toggle off the facts' line in
all six root-font cells, Diagram and Gantt, three selections, on both pointers; the group changes the foot row there by 0 px and reads the toggle on the facts' line, and S6 is a 100 % rule, so this is reported and not judged.)
**The group removes every one of these:** `base-grouped` reads the toggle on the facts' line in all of them (0 readings off), and S7's largest savings are exactly the
stranded cells above. This is a shipped defect inside the design floor and is filed as `docs/TECH_DEBT.md` #581.

### Row 580: the four existing messages with A″'s own-row treatment

Long names (two 46-character activity names), in product order. "Shipped" is the foot row's growth against the same cell's base; "own-row" is against the base **with the group**
(S2's baseline), and the figure in brackets is against the plain shipped base. "Cut" is whether the sentence is ellipsised. Every own-row reading holds S1 (every button self-hit),
S2 (extra 0, or negative for the multi-select bar, which adds no strip) and S6 (toggle on the facts' line).

| Message                                  | 1024 × 600 mouse, shipped                         | 1024 × 600 mouse, own-row                                                       | 1210 to 1250 mouse, own-row                                     | 1280 mouse, own-row                   |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| Bare Linked band, nothing / flagged bar  | cut; +6 / +54                                     | whole sentence, 2 lines; **+58 / +26**, stage 344 / 240 (bases 402 / 266)       | whole, **1 line**; +50 / +58, stage 552 / 448 (bases 602 / 506) | whole, 2 lines; +18 / +66             |
| Undo result, nothing / flagged bar       | cut; +6 / +54                                     | whole, 1 line; **+50 / +18**, stage 352 / 248                                   | whole, 1 line; +50 / +58                                        | whole, 1 line; +10 / +58              |
| Layout-resolved, nothing / flagged bar   | cut; +6 / +54                                     | whole, 2 lines; **+58 / +26**, stage 344 / 240                                  | whole, 1 line; +50 / +58                                        | whole, 2 lines; +18 / +66             |
| Multi-select bar (2 long names selected) | count kept, name cut; foot unchanged (194 px bar) | **whole sentence, buttons under it; 122 px bar, −32 px**, stage 280 against 248 | whole, 1 line; 82 px bar, **−12 px**, stage 520 against 508     | whole, 2 lines; 130 px bar, **−4 px** |

At 1210 to 1250 the shipped strips cost +6 (nothing selected) and +54 (flagged bar) and are cut in all of them. **On a finger** the own-row treatment at 1024 reads +62 / +70
(stage 216 / **52** with the flagged bar, where its base is 122: the coarse-1024 cell amendment 1's Q2 accepted, and where the shipped strips already read stage 56), the multi-select
bar **−40**; at 1210 to 1250 it reads +62 / +70 against the grouped base and **+62 / +22 against the shipped one**, because the group's 48 px saving (above) is netted off.
All 182 buttons in the 98 shipped and own-row message readings on each pointer are self-hit after scrolling.

**What this means for row 580:** the own-row treatment holds S1, S2 and S6 for all four messages at every width the amendment asks for (1024, 1210 to 1250, 1280), on both
pointers, so row 580 follows M2 as its own PR (amendment 3 §8), now with the group as part of M2.

### Discarded runs, and why

- **Run 1 (fine only), discarded:** the probe's held "Recalculating…" cleanup unrouted `**/schedule/recalculate` while its handler was still waiting, so the handler's
  `route.continue()` failed ("Route is already handled") and Playwright reported `1 failed` after the readings had been taken. The file it wrote was complete; the judge's verdicts on it
  were the same and 1,259 of 1,259 readings agree with the final run on cell, mode, variant, foot height, stage height, outlet width and strip height. It is discarded because a
  run that fails does not count, and because the fault was real. The fix waits for `data-schedule-state="current"` before unrouting. **The coarse run was taken once, after the fix.**
- **The judge's first S2 formula for the multi-select bar**, written before any reading was judged, scored its reshaped bar as if a strip had been added; a reshaped bar adds none
  (`expected` 0), and that was corrected before the verdicts above (the figures in this section are all from the corrected judge).
- No other run was taken: no reading was repeated to get a different answer.

### What this means for the amendments

- **Amendment 3's refinement passes.** The decision rule ("No rule fires: fold A″ (§9). Row 580 follows as §8") applies, and this commit carries the §9 fold-in. Option B is **not built**.
- **Amendment 3 claims the readings confirm:** the band is a foot-row width and the group removes it for every floor (S2 and S6 at every sweep width on both pointers); A″'s
  geometry at 1210 to 1250 is the 1200 geometry (outlet 957 on its own line, bar 3 lines to 2); the 1912 cost is unchanged (grid cell: extra 0 on both pointers, as M0c).
- **Amendment 3 claims the readings qualify.** (1) §2 says the shipped dock has the stranding "at the 18 rem floor, whenever a selection bar is showing and the facts are wide";
  it also has it **at the 36 rem coarse floor with the facts current** (above), which the derivation did not consider, and the widest sentence strands it at 1270 to 1280, outside
  the two bands §2 named. (2) §11 says ADR-0187 D3's "costs 40 px at 1120 to 1250" on fine pointers "may be this same stranding; not read": on a **mouse** with current facts the
  shipped dock strands nothing in the Diagram or the Gantt (above), so that figure is not this stranding; what is read is the finger's 48 px at 1210 to 1250. (3) §6 S6 as written
  cannot be run on M0c's readings (no facts `top`); a proxy was used and is stated above.
- **For M2's ADR work, not edited here:** ADR-0114 D2 still says "The facts lead and the dock follows" (`docs/adr/0114-…md:86-88`) and carries no amendment note, while the code
  has had the facts trailing since foot-row-and-deck M3 (`activity-bottom-panel.tsx:457-475`; the docblock there records why the ADR's reason was false). ADR-0216 amends ADR-0114 D2
  and should state that drift.
