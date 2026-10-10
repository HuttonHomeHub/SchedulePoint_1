# Toolbar redesign — M5 measurement record (the promotion ladder)

Taken 2026-10-10 on the M5 build by `apps/web/measure-toolbar/toolbar-redesign-m5.spec.ts` (a harness, not a gate;
ADR-0081 §3), fine and coarse pointers, the container's Chromium 1194, a plan with a long name ("Riverside Quarter —
Phase 2 Substructure"). Readings: `apps/web/measure-output/toolbar-redesign-m5{,-unpromoted}.{fine,coarse}.json` (not
committed; the figures below are the record).

**Re-taken the same day after the review of the first build** (the sections below are the re-taken record; §8 says what
changed and why). The free widths of the unpromoted deck used to be `m4-measurement.md`'s readings; they are now read
from the **same harness** with the stage media queries answering "not reached" (`M5_UNPROMOTED=1`), at six stage cells
instead of four and with Resource view icon-only, and `measure-toolbar/promotion-widths.mjs` turns the two runs into
`promotion-widths.{fine,coarse}.json`, so no figure in those files is typed by hand.

## 0. What contradicts the spec, the plan or the brief

1. **The committed `promotion-widths.*.json` were provisional and wrong for the DO row.** Their `provisional: true`
   and the plan ("re-taken after M4, before M5") both said so; the brief called them the inputs. M0 projected the
   DO row 143.3 px narrower than the real deck: it read **1022 px** of natural width where the real deck is
   **1165.3** (Apply levelled dates… is labelled from 79 rem on a mouse — M0 projected it icon-only), so DO's free
   width at 1280 is **98.7 px (fine), not 242**. Using the file as it stood would have promoted Health check
   and Share together at 1280 and wrapped DO. Both files are **re-taken** (this commit): `provisional: false`, the
   free widths from the real unpromoted deck, every promoted form's width from the real promoted deck at
   3840 × 1440. The LOOK free widths were right (128.6 / 288.6 / 688.6 / 1336.6 fine).
2. **Health check does not promote at 1280.** The spec's provisional table put P1 at 80 rem on both pointers; with
   the real DO row it needs 125.7 px against a worst-state room of 96.6 (fine) / 43.9 (coarse). **Only Share…
   promotes at 1280 on a mouse**, so the default-viewport journeys that open Health check from its menu still find
   it there; the ones that open Share… do not (see §6).
3. **The worst LOOK state is the cycling read-out, not the idle chip.** M0 reserved "1 conflict"; M4 made the chip
   count-only, but "Conflict 1 of 1" is 29 px wider than "1 conflict". The reserve is the cycling read-out with a
   peer's pen (`conflicts-cycling+peer-pen`), which is also the widest DO state.
4. **The flat sets are value-only, as §4.11 says, and measure much narrower than M0's:** Colour by is **300.5 px**
   (not 370.3) and Link kinds **364.5 / 388.5** (not 501.9 / 525.9). The Link wording is the product's own
   (`Finish → Start`, from `DEPENDENCY_TYPE_LABELS`), not the spec's "Finish-to-start". Members carry no glyph. The
   Link set's caption reads **Type** (it read "Link", beside the Link button it belongs to, which made two adjacent
   "Link" labels; the caption is `aria-hidden` and its width is in the figure).
5. **The search field does not grow at 2560.** The spec lists "+240 px at 160 rem" in the ladder. After L1–L6 LOOK has
   **389 px free (15.3 %)** at 2560 on a mouse in the base state and **264 px** in the worst state (coarse: 217 px
   and 84 px), with every LOOK command on the bar. A +240 growth fits in the worst state and takes the base-state gap
   to 149 px; it was not built because the owner asked for the commands first and nothing else is left to promote
   there. The 15.3 % is the one stage cell over 15 % with the ladder exhausted rather than withheld. If the owner
   wants it, it is one `searchFieldWidth` branch at `PROMOTE_160`, not a ladder change.
6. **C1 (the zoom presets into the diagram's corner) is not built.** It stages on the stage's width, not the deck's;
   the brief excludes the `canvas` row from `computePromotionStages`; and M4 found the cluster's geometry has
   nowhere to put a 430 px row. View ▾ keeps its Zoom section. Recorded as deferred, with the reason.
7. **A stage cell can be over 15 % empty when nothing left in a menu fits.** SC-17 is read the way the ladder fills a
   row, with the worst state and a 2 px safety margin reserved (`safetyPx` in the JSON); the journey asserts it that
   way. The first build had one such cell (coarse LOOK at 1912, 15.3 %); the re-taken ladder has three more, all
   LOOK, all where the ladder is out of commands to spend (§3).
8. **Resource view is now icon-only at every width** (the product owner asked for it; it had been `'roomy'`, OD-1, and
   this build first read that line as already satisfied below 79 rem). It frees 94.8 px of LOOK at every stage cell on
   both pointers (LOOK free at 1280, base: 128.6 → 223.4 fine, 20.6 → 115.4 coarse) and the ladder is re-derived
   with it. The control keeps its name (`aria-label`) and a tooltip that says what it does ("Show resource loading
   under the diagram").

## 1. The promoted forms (px, at 3840 × 1440)

| Rank | Command                          | Fine  | Coarse |
| ---- | -------------------------------- | ----- | ------ |
| L1   | Critical only                    | 113.9 | 121.9  |
| L2   | Colour by (caption + 3 values)   | 300.5 | 324.5  |
| L3   | Late-start overlay               | 151.6 | 159.6  |
| L4   | Feasible window                  | 145.3 | 153.3  |
| L5   | Levelled placement               | 162.9 | 170.9  |
| L6   | Has conflict only                | 144   | 152    |
| P1   | Health check                     | 121.7 | 129.7  |
| P2   | Add: Start milestone             | 169.9 | 177.9  |
| P3   | Add: Finish milestone            | 176.7 | 184.7  |
| P4   | Share… (net of its trigger, see) | 33.8  | 41.8   |
| P5   | Link kinds (caption + 3 values)  | 364.5 | 388.5  |
| P6   | Compare revisions                | 156.8 | 164.8  |
| P7   | Earned value…                    | 133   | 141    |
| P8   | Resource histogram…              | 177.2 | 185.2  |

**P4 is charged net.** Share… is 86.8 px (fine) / 94.8 (coarse) on the bar, and while it is there the Share &
export trigger reads **Export**, which is 53 px narrower than its other name, so the row grows by 33.8 / 41.8 px,
not by the button's width. The file carries `triggerShrinkPx: 53` and the journey checks the gross widths and the net
sum separately. Single buttons agree with M0's donor-clone readings to 0.1 px, which is the check that the projection
method was sound and that what moved was the deck underneath it (§0.1). Resource histogram… on touch (P8) is `never`, so
it is not on the bar at 3840 and the harness cannot read it; its committed width from the first build stands (a
button's width does not depend on the rest of the deck).

## 2. The stages (`promotion-ladder.ts`; `promotion-ladder.test.ts` pins them to `computePromotionStages`)

Six stages now: 80, 90, **100**, 119.5, **135**, 160 rem (1280, 1440, **1600**, 1912, **2160**, 2560 px).

| Rank | Fine            | Coarse        |
| ---- | --------------- | ------------- |
| L1   | PROMOTE_90      | PROMOTE_90    |
| L2   | PROMOTE_119_5   | PROMOTE_119_5 |
| L3   | **PROMOTE_100** | PROMOTE_135   |
| L4   | PROMOTE_135     | PROMOTE_135   |
| L5   | PROMOTE_135     | PROMOTE_160   |
| L6   | PROMOTE_160     | PROMOTE_160   |
| P1   | PROMOTE_90      | PROMOTE_90    |
| P2   | PROMOTE_100     | PROMOTE_100   |
| P3   | PROMOTE_119_5   | PROMOTE_119_5 |
| P4   | PROMOTE_80      | PROMOTE_90    |
| P5   | PROMOTE_160     | PROMOTE_160   |
| P6   | PROMOTE_119_5   | PROMOTE_135   |
| P7   | PROMOTE_135     | PROMOTE_135   |
| P8   | PROMOTE_160     | never         |

Ladder order within a row is unchanged: LOOK L1–L6; DO P1, P4, P2, P3, P6, P7, P5, P8. **Late-start overlay is the
first LOOK command a mouse gains at 1600** (L3, as the owner asked) and 135 rem spends the next LOOK commands (Feasible
window, Levelled placement) and Earned value…. **Colour by is on the bar before Late-start overlay on touch**
(L2 at 1912, L3 at 2160): the question was whether an overlay that pauses editing should be the first thing a finger
gets, and with Resource view icon-only Colour by (324.5 px) fits at 1912 in the worst state, so the ladder order alone
answers it and no ordering rule was needed. On touch Critical only arrives at 1440, Colour by at
1912 and Late-start overlay at 2160. Skip-fill still matters: Share… (P4) promotes at 1280 on a mouse though Health
check (P1) ahead of it does not fit.

## 3. SC-17: unused width per row, before and after (base state; unused / row width)

"Before" is the deck before the ladder with Resource view icon-only (`M5_UNPROMOTED=1`), so the table isolates what
the ladder does; the first build's "before" was the M4 deck with Resource view labelled.

| Row         | 1280 before | 1280 after | 1440 before | 1440 after | 1600 before | 1600 after | 1912 before | 1912 after | 2160 before | 2160 after | 2560 before | 2560 after |
| ----------- | ----------- | ---------- | ----------- | ---------- | ----------- | ---------- | ----------- | ---------- | ----------- | ---------- | ----------- | ---------- |
| fine LOOK   | 17.7 %      | 17.7 %     | 26.9 %      | 18.6 %     | 29.8 %      | 12.5 %     | 41.3 %      | 10.8 %     | 48.1 %      | 6.4 %      | 56.3 %      | 15.3 %     |
| fine DO     | 7.8 %       | 4.8 %      | 18.2 %      | 6.7 %      | 26.4 %      | 5.1 %      | 38.5 %      | 2.7 %      | 45.6 %      | 7.6 %      | 54.2 %      | 0.5 %      |
| coarse LOOK | 9.1 %       | 9.1 %      | 19.3 %      | 10.5 %     | 22.9 %      | 15.0 %     | 35.6 %      | 11.7 %     | 43.1 %      | 6.9 %      | 52.0 %      | 8.5 %      |
| coarse DO   | 3.6 %       | 3.6 %      | 14.5 %      | 1.9 %      | 23.1 %      | 0.3 %      | 35.8 %      | 6.7 %      | 43.2 %      | 2.9 %      | 52.1 %      | 2.7 %      |

Every cell is **one line per row**, fine and coarse, except coarse DO at 1024 × 600 (two lines, the accepted four-line
touch floor, §7) and coarse LOOK at 1280 with a conflict read-out showing (−17.9 px free, two lines; it was −112.7 before
Resource view went icon-only, and nothing is promoted into it). **Four cells are over 15 %**, each because the ladder is
out of commands that fit rather than because it stopped early: fine LOOK at 1280 (17.7 %, Critical only needs
117.9 px and the worst state has 98.1), fine LOOK at 1440 (18.6 %, 140.2 px is left in the worst state and the
smallest command still in a menu, Has conflict only, needs 150), coarse LOOK at 1600 (15.0 %, on the line), and fine LOOK at 2560 (15.3 %, every LOOK command
is already on the bar). The journey judges them the way the ladder fills a row, with the worst state and the 2 px
reserved.

Free width left in the **worst** state (cycling read-out on LOOK, a peer's pen on DO), after promotion:

| Row         | 1280     | 1440     | 1600     | 1912     | 2160     | 2560     |
| ----------- | -------- | -------- | -------- | -------- | -------- | -------- |
| fine LOOK   | 98.1 px  | 140.1 px | 72.5 px  | 80.1 px  | 11.9 px  | 263.9 px |
| fine DO     | 58.8 px  | 93.1 px  | 79.2 px  | 49.7 px  | 160.7 px | 11.0 px  |
| coarse LOOK | −17.9 px | 16.1 px  | 104.1 px | 87.7 px  | 14.8 px  | 83.9 px  |
| coarse DO   | 43.9 px  | 24.4 px  | 2.5 px   | 125.8 px | 60.0 px  | 67.5 px  |

The predicted figures (the unit test's arithmetic over the JSON: `freeWorst − what is on the bar`) and these readings of
the built deck agree to 0.1 px in the cells checked by hand (fine LOOK at 2160: 906.1 − 894.2 = 11.9).

### 3.1 SC-17 restated: between the stages (the 2026-10-10 review)

The first build asserted SC-17 **at the stage cells only**, so it was true at four widths and silent about the ones
in between. A window is any width, and between two stages the free room grows with the window until the next stage
spends it. Measured, base state, swept every 40 px:

| Range                          | Fine                | Coarse              |
| ------------------------------ | ------------------- | ------------------- |
| 1192–1279 (under 80 rem)       | 31.4 % at 1272 LOOK | 22.8 % at 1272 LOOK |
| 1280–2600 (the ladder at work) | 26.5 % at 1432 LOOK | 27.4 % at 1872 LOOK |

So SC-17 is, honestly: **at each of the six stage cells, ≤ 15 % per row or nothing in a menu fits; between them, no row
is more than 30 % empty from 80 rem on, or more than 33 % empty under it, and none wraps.** The 30 % and 33 % are
ceilings set just over the measured peaks (`CEILING_PCT` in `promotion.spec.ts`), a regression guard and not a
target. The gap under 80 rem is the compact deck: nothing promotes there by design (the labels are still icon-only,
`--container-roomy` is 79 rem of container, and the deck is 16 px narrower than the window, so a 1272 px window is 78.5), and it is the narrowest band the ladder does
not reach. The peaks just short of a stage (1432, 1872) are the cost of staging on viewport thresholds instead of on the
row's measured width, which ADR-0109 D1 forbids. Two more stages (100 and 135) took the worst gap from the first build's
648 px between 1912 and 2560 to these figures; a stage every ~160 px would flatten it further and is a ladder
decision for the owner.

## 4. Verified red (ADR-0110)

- **SC-18 (c)**: P4's fine stage changed from `PROMOTE_80` to `PROMOTE_90` in `promotion-ladder.ts` →
  `promotion-ladder.test.ts` fails, and its diff names `P4`. (First build; unchanged by the re-take.)
- **SC-18 (b)**: the same change → `promotion.spec.ts` "no command left in a menu would fit the free gap" fails
  with `fine 1280 do: 96.6 px free in the worst state and P4 would fit`. (First build.)
- **E-2**: `successorFor` ignored in `useToolbarFocusHandoff` → the "lands on the successor" case fails (focus lands
  on the toolbar). **E-1**: the `button.focus()` call removed from `usePromotionFocusFollow` → its first case fails.
- **The manifest**: removing the "Health check…" menu row at stage 0 without promoting it fails "a menu loses
  exactly the rows that are on the bar".
- **E-1b (review B1)**: the `restoreTo.current?.focus()` line removed from `useCloseWhenChanged` → both unit cases
  fail, and `promotion.spec.ts` "a resize closes a menu the reader is in, and focus lands on its trigger" fails with
  `Received: inactive` (focus on the page). Before the fix the hook closed the menu and left focus on `<body>`.
- **One subscription for the stage**: the unit case "never renders the stage between two thresholds that a single
  resize crosses" fails against the old one-`useMediaQuery`-per-threshold hook (it saw stages 2 and 3 on the way to 4).
  The browser showed it first: the E-1 journey on touch failed with Critical only not focused, because the menu had been
  closed and its focus handed to the trigger for the intermediate stage, before the stage that promotes the row.
- **The sweep**: the ceilings set to 0 → `promotion.spec.ts` fails naming the width and row of the peak
  (`fine 1432 look: 26.5 % empty`), which is how §3.1's peaks were read.

## 5. What changed in shared primitives (ADR-0111 review owed)

No key set, roving order or Tab stop of `Toolbar`, `Menu` or `Deck` changed. Added, all optional: `ToolbarItem.
visibleLabel` and `ToolbarButton`'s matching `visibleLabel` prop (the printed text when shorter than the accessible
name; `defineToolbar` refuses one not contained in the name), `ToolbarItem.successorId`, and a `successorFor` option on
`useToolbarFocusHandoff` (focus lands on a named control instead of the container, falling back to the container if it
is gone; the message names the destination). `Deck` and `Toolbar` pass the two through. **Added in the review:**
`ToolbarPopover`'s optional `closeOnChangeOf` (the panel closes when the value changes; focus inside it goes to the
trigger and "Menu closed because the toolbar changed." is announced), `useCloseWhenChanged` (the shared rule, also what
the four `Menu`-backed triggers use through `useCloseOnPromotionChange`), and `usePromotionStage` now a single
`useSyncExternalStore` over `PROMOTION_STAGES`. A promoted item also carries `srDescription` (the same bare clause as its
tooltip), so the button's description is read on focus. **Things for the reviewers to execute**: a screen reader on a
flat set ("Colour", then "Colour by: Total float, toggle button, pressed"); resize the window with focus on a menu row
that stays, on a menu row that promotes, on a promoted button, and at text-only 200 %; Tab and arrow across a promoted
set; the dock toggles' pressed state against a dock closed from its own button; the Share & export trigger's name
changing to Export (and back) under a screen reader's cursor.

## 6. Journeys changed

`e2e-share` (Share… is a button at 1920), the three suites that pick Start/Finish milestone from the Add menu
(`e2e-authoring`, `e2e-authoring-flow`, `e2e-share` supports), `e2e-health-check`, `e2e-interchange`,
`e2e-revision-compare`, `e2e-workspace-chrome` (`dock`, `activities-panel-scroll`): they now reach a promoted command
through `e2e-support/toolbar.ts` (`pressPromotable`, `openHealthCheck`, `openShare`, `pickAddKind`), which presses the
button when the viewport has promoted it and the menu row when not. Closing the Health check or Compare revisions dock
returns focus to its toolbar button when it is on the bar (`right-docks.ts` `DOCK_TRIGGER_ITEMS`), else to Analysis.
**Added in the review:** `e2e-interchange` and `e2e-export` find the deliverables trigger by `Share & export` **or**
`Export`; the promotion journey is its own config and CI step (`playwright.promotion.config.ts`,
`test:e2e:promotion`) on the lightest shard, with three existing steps moved to pay for it (`scripts/e2e-durations.json`
carries the figures; the web total, 2393 s, is now over `ci-sharding/m4-measurement.md` §7's 2,372 s re-open trigger).

## 7. Cells between the stages and the floor

Base state, unused width: **1646 × 1097** fine LOOK 243.8 px (15.0 %), DO 127.3 px (7.8 %); coarse LOOK 283.4 px
(17.4 %), DO 50.7 px (3.1 %) — now a stage cell's neighbour (1600 is 46 px under it) rather than 266 px short of the
next one. **1024 × 600** is unchanged by M5 (nothing promotes): fine one line per row; coarse DO two lines (−143.7 px),
the accepted four-line touch floor. **1280 × 720** equals 1280 × 800 on every width. Screenshots:
`photos/m5-<pointer>-<cell>-base.png`, now including 1600 × 900 and 2160 × 1200.

**Touch wraps between the floor and 1192.** Recorded because OD-2 said "four lines at 1024" and nothing says where
that stops: see §9, measured with a probe across 1024–1200.

## 8. What the 2026-10-10 review changed, in one place

1. **B1 (focus on a closing menu)** — fixed (E-1b, §4, §5). The popover family (Filter, View) takes the same rule.
2. **The tooltip** said "Also in ‹menu›" after the row had left that menu. It now says "Moves into the ‹menu› menu in a
   narrower window", as the native title and, for a screen reader, as the button's description (`srDescription`), bare,
   so the name is not read twice. A sighted keyboard user still gets it only from the description, not visibly: a
   labelled `ToolbarButton` has no tooltip primitive (the `'name-echo'`/`'description'` primitive is for a label that can
   be absent), and giving it one changes a shared button's contract. Not done; recorded.
3. **Copy that named a row that can move**: the Late-start banner and the blocked undo message said "Turn it off in
   View". They say "Turn off Late-start overlay". The rest of the copy was checked by grepping user-visible strings for
   Health check, Share, Compare revisions, Feasible window, Levelled placement, Colour by, Earned value and Resource
   histogram beside a menu name: none other points at a row by its route (`Analysis → Baselines…` is the anchor and
   never moves).
4. **The empty space between stages**: two stages (§2), a sweep gate and the honest SC-17 (§3.1). Resource view icon-only
   (§0.8). Colour by before Late-start overlay on touch fell out of the widths (§2).
5. **CI**: §6.

Suggested items: **Export** while Share… is on the bar (§1); the Link set's caption **Type** (§0.4). The Link set keeps
**Start → Finish in the menu** rather than promoting all four: Start → Finish is the Link menu's unconditional anchor
(spec §4.11, UX N3: a menu never empties — "Stop linking" renders only while linking, so nothing else could anchor
it), and the rarest of the four is the right one to leave. A single row in a menu under a bar of three is the cost,
accepted. **Alternative sets stay flat** (no `role="group"`): ADR-0119 D2 refuses a partial partition of a taxonomy
group, and View and Author hold other items, so a named sub-group for Colour by or Link kinds is not available without
amending that decision; each member's name carries the set and 4.1.2 is met (a set of toggle buttons is a weaker
description than a radiogroup, not an incorrect one, ADR-0119's own reading). **Compare revisions staying pressed after
Escape** predates M5: Escape closes the dock only from inside it (`RevisionComparePanel.tsx` and
`ScheduleHealthPanel.tsx` handle `keydown` on the panel), and opening the dock leaves focus where it was, so Escape
from the toolbar button never reached it by the menu route either; probed on the built deck (focus stays on
`compare-revisions`, Escape leaves `aria-pressed="true"` and the dock open), and the pressed state is the true one.
`derivePromotedItems` refuses a trigger with a fractional `order` (its formula sorts at `order + rank / 100`); the stage
names, rems and queries derive from one table, `PROMOTION_STAGES`; the optional spreads in the derivation are
`present(...)`.

## 9. Touch below 1192

(see the probe record, appended below once taken)
