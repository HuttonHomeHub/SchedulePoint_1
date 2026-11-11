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
