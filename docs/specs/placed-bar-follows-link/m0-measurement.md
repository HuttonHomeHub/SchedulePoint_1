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
