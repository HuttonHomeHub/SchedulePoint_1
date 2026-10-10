# Toolbar redesign — M5 measurement record (the promotion ladder)

Taken 2026-10-10 on the M5 build by `apps/web/measure-toolbar/toolbar-redesign-m5.spec.ts` (a harness, not a gate;
ADR-0081 §3), fine and coarse pointers, the container's Chromium 1194, a plan with a long name ("Riverside Quarter —
Phase 2 Substructure"). Readings: `apps/web/measure-output/toolbar-redesign-m5.{fine,coarse}.json` (not committed;
the figures below are the record). The free widths of the **unpromoted** deck are `m4-measurement.md`'s readings
(`toolbar-redesign-m4.{fine,coarse}.json`), taken on the same deck M5 starts from.

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
   (not 370.3) and Link kinds **360.8 / 384.8** (not 501.9 / 525.9). The Link wording is the product's own
   (`Finish → Start`, from `DEPENDENCY_TYPE_LABELS`), not the spec's "Finish-to-start". Members carry no glyph.
5. **The search field does not grow at 2560.** The spec lists "+240 px at 160 rem" in the ladder. After L1–L5 (and
   now L6) LOOK has **294 px free (11.6 %)** at 2560 on a mouse in the base state and **169 px** in the worst state,
   so a +240 growth does not fit in the worst state and SC-17 is met without it (11.6 % ≤ 15 %). Not built; if the
   owner prefers a bigger search field to Late-start overlay/Feasible window/Levelled placement, it is a ladder
   reorder, not new work.
6. **C1 (the zoom presets into the diagram's corner) is not built.** It stages on the stage's width, not the deck's;
   the brief excludes the `canvas` row from `computePromotionStages`; and M4 found the cluster's geometry has
   nowhere to put a 430 px row. View ▾ keeps its Zoom section. Recorded as deferred, with the reason.
7. **Coarse LOOK at 1912 is 15.3 % empty in the base state** (SC-17's 15 %). The ladder withholds Feasible window
   (157.3 px with its gap) there because it would leave **0.4 px** with a conflict read-out present. SC-17 is read
   the way the ladder fills a row, with the worst state and a 2 px safety margin reserved
   (`safetyPx` in the JSON); the journey asserts it that way.
8. **"Resource view icon-only" is already true below `--container-roomy`** (OD-1, `'roomy'`); I read the brief's
   line as that decision and changed nothing. Apply levelled dates… is icon-only on touch at every width
   (`'roomy-fine'`), Float paths is icon-only on the selection bar (`'never'`), and touch at exactly 1024 accepts
   four lines (OD-2): all three were already in the code. If Resource view should be icon-only at every width, it
   is one word and it moves LOOK's free width by about 95 px, which means re-deriving the ladder.

## 1. The promoted forms (px, at 3840 × 1440)

| Rank | Command                         | Fine  | Coarse |
| ---- | ------------------------------- | ----- | ------ |
| L1   | Critical only                   | 113.9 | 121.9  |
| L2   | Colour by (caption + 3 values)  | 300.5 | 324.5  |
| L3   | Late-start overlay              | 151.6 | 159.6  |
| L4   | Feasible window                 | 145.3 | 153.3  |
| L5   | Levelled placement              | 162.9 | 170.9  |
| L6   | Has conflict only               | 144   | 152    |
| P1   | Health check                    | 121.7 | 129.7  |
| P2   | Add: Start milestone            | 169.9 | 177.9  |
| P3   | Add: Finish milestone           | 176.7 | 184.7  |
| P4   | Share…                          | 86.8  | 94.8   |
| P5   | Link kinds (caption + 3 values) | 360.8 | 384.8  |
| P6   | Compare revisions               | 156.8 | 164.8  |
| P7   | Earned value…                   | 133   | 141    |
| P8   | Resource histogram…             | 177.2 | 185.2  |

Single buttons agree with M0's donor-clone readings to 0.1 px, which is the check that the projection method was
sound and that what moved was the deck underneath it (§0.1).

## 2. The stages (`promotion-ladder.ts`; `promotion-ladder.test.ts` pins them to `computePromotionStages`)

| Rank | Fine           | Coarse        |
| ---- | -------------- | ------------- |
| L1   | PROMOTE_90     | PROMOTE_119_5 |
| L2   | PROMOTE_119_5  | PROMOTE_160   |
| L3   | PROMOTE_160    | PROMOTE_119_5 |
| L4   | PROMOTE_160    | PROMOTE_160   |
| L5   | PROMOTE_160    | PROMOTE_160   |
| L6   | PROMOTE_160    | never         |
| P1   | PROMOTE_90     | PROMOTE_90    |
| P2   | PROMOTE_119_5  | PROMOTE_119_5 |
| P3   | PROMOTE_119_5  | PROMOTE_119_5 |
| P4   | **PROMOTE_80** | PROMOTE_119_5 |
| P5   | PROMOTE_160    | PROMOTE_160   |
| P6   | PROMOTE_160    | PROMOTE_160   |
| P7   | PROMOTE_119_5  | PROMOTE_160   |
| P8   | never          | never         |

Ladder order within a row is the spec's: LOOK L1–L6; DO P1, P4, P2, P3, P6, P7, P5, P8. Skip-fill matters twice
here: Share… (P4) promotes at 1280 though Health check (P1) ahead of it does not fit, and Earned value… (P7)
promotes ahead of Compare revisions (P6) on a mouse at 1912.

## 3. SC-17: unused width per row, before and after (base state; unused / row width)

| Row         | 1280 before | 1440 before | 1912 before | 2560 before | 1280 after | 1440 after | 1912 after | 2560 after |
| ----------- | ----------- | ----------- | ----------- | ----------- | ---------- | ---------- | ---------- | ---------- |
| fine LOOK   | 10.2 %      | 20.3 %      | 36.3 %      | 52.5 %      | 10.2 %     | 12.0 %     | 14.0 %     | 11.6 %     |
| fine DO     | 7.8 %       | 18.2 %      | 38.5 %      | 54.2 %      | 0.6 %      | 3.0 %      | 1.2 %      | 5.7 %      |
| coarse LOOK | 1.6 %       | 12.7 %      | 30.6 %      | 48.3 %      | 1.6 %      | 12.7 %     | **15.3 %** | 10.9 %     |
| coarse DO   | 3.6 %       | 14.5 %      | 35.8 %      | 52.1 %      | 3.6 %      | 5.1 %      | 4.0 %      | 0.8 %      |

("Before" is the real M4 deck, unpromoted. M0's "before today" table was the pre-M2 deck and is superseded.) The one
figure over 15 % is §0.7. Every cell is **one line per row**, fine and coarse, except coarse LOOK at 1280 with a
conflict read-out showing, which was two lines before M5 (−112.7 px free, nothing promoted into it) and is accepted
for touch (`m4-measurement.md` §2).

Free width left in the **worst** state (cycling read-out on LOOK, a peer's pen on DO), after promotion:

| Row         | 1280      | 1440    | 1912     | 2560     |
| ----------- | --------- | ------- | -------- | -------- |
| fine LOOK   | 3.3 px    | 45.3 px | 140.9 px | 169.1 px |
| fine DO     | 5.8 px    | 40.1 px | 20.5 px  | 142.9 px |
| coarse LOOK | −112.7 px | 47.3 px | 157.7 px | 145.1 px |
| coarse DO   | 43.9 px   | 70.2 px | 72.8 px  | 18.2 px  |

The predicted figures (the unit test's arithmetic over the JSON) and these readings of the built deck agree to
0.1 px in every cell.

## 4. Verified red (ADR-0110)

- **SC-18 (c)**: P4's fine stage changed from `PROMOTE_80` to `PROMOTE_90` in `promotion-ladder.ts` →
  `promotion-ladder.test.ts` fails, and its diff names `P4`.
- **SC-18 (b)**: the same change → `promotion.spec.ts` "no command left in a menu would fit the free gap" fails
  with `fine 1280 do: 96.6 px free in the worst state and P4 would fit`.
- **E-2**: `successorFor` ignored in `useToolbarFocusHandoff` → the "lands on the successor" case fails (focus lands
  on the toolbar). **E-1**: the `button.focus()` call removed from `usePromotionFocusFollow` → its first case fails.
- **The manifest**: removing the "Health check…" menu row at stage 0 without promoting it fails "a menu loses
  exactly the rows that are on the bar".

## 5. What changed in shared primitives (ADR-0111 review owed)

No key set, roving order or Tab stop of `Toolbar`, `Menu` or `Deck` changed. Added, all optional: `ToolbarItem.
visibleLabel` and `ToolbarButton`'s matching `visibleLabel` prop (the printed text when shorter than the accessible
name; `defineToolbar` refuses one not contained in the name), `ToolbarItem.successorId`, and a `successorFor` option on
`useToolbarFocusHandoff` (focus lands on a named control instead of the container, falling back to the container if it
is gone; the message names the destination). `Deck` and `Toolbar` pass the two through. **Things for the reviewers to
execute**: a screen reader on a flat set ("Colour", then "Colour by: Total float, toggle button, pressed"); resize the
window with focus on a menu row, on a promoted button, and at text-only 200 %; Tab and arrow across a promoted set;
the dock toggles' pressed state against a dock closed from its own button.

## 6. Journeys changed

`e2e-share` (Share… is a button at 1920), the three suites that pick Start/Finish milestone from the Add menu
(`e2e-authoring`, `e2e-authoring-flow`, `e2e-share` supports), `e2e-health-check`, `e2e-interchange`,
`e2e-revision-compare`, `e2e-workspace-chrome` (`dock`, `activities-panel-scroll`): they now reach a promoted command
through `e2e-support/toolbar.ts` (`pressPromotable`, `openHealthCheck`, `openShare`, `pickAddKind`), which presses the
button when the viewport has promoted it and the menu row when not. Closing the Health check or Compare revisions dock
returns focus to its toolbar button when it is on the bar (`right-docks.ts` `DOCK_TRIGGER_ITEMS`), else to Analysis.

## 7. Cells between the stages (not SC-17 cells; recorded because the owner works at 1646)

Base state, unused width: **1646 × 1097** fine LOOK 304.6 px (18.7 %), DO 248.2 px (15.2 %); coarse LOOK 314.6 px, DO 278.3 px
(stage 2 only: Critical only, Health check, Share… on a mouse). That is over 15 %, by construction: stages are the four
widths SC-17 names, and 1646 sits 266 px short of the next one (1912). A wider ladder (a stage at about 1600) is a ladder
change for the owner, not a defect. **1024 × 600** is unchanged by M5 (nothing promotes): fine one line per row; coarse DO
two lines (−143.7 px), the accepted four-line touch floor. **1280 × 720** equals 1280 × 800 on every width. Screenshots:
`photos/m5-<pointer>-<cell>-base.png`.
