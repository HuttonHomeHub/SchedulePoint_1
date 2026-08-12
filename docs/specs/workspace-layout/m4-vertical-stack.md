# M4-T1 — the vertical stack, measured

_Harness: `apps/web/measure-toolbar/vertical-stack.spec.ts`
(`pnpm --filter @repo/web measure:toolbar`), Chromium, on a populated plan with a computed schedule
and **the pen held** — `CompactPenStatus` renders differently otherwise, and the state a planner is
in while using the toolbar is the state worth measuring. Bands are located by role and structure,
never by class name._

M4-T1's instruction is _"Measure, then claim"_, because **M0 measured no heights at all**
(`measure.spec.ts:78-79` reads widths only) and every figure in `design.md` §2.1 is therefore
arithmetic over class names. Its own risk note says claiming a canvas gain from arithmetic is
ADR-0076 Class 3 and that _this design already did it once_.

---

## 1. `design.md` §2.1 against the browser

| claim (`design.md` §2.1) | stated  | **measured** | error                |
| ------------------------ | ------- | ------------ | -------------------- |
| header band              | 45 px   | **53 px**    | +8                   |
| above the canvas         | ≈199 px | **257 px**   | **+58 (29 % low)**   |
| canvas height @ 1080     | ≈717 px | **533 px**   | **−184 (35 % high)** |

**All three are wrong, and the third is wrong in the direction that flatters the design**: it claims
a third more canvas than the product actually has. Identical at 1920 × 1080 and 1440 × 960 for
everything above the canvas — nothing in the stack is viewport-height-dependent — so the canvas
simply absorbs the difference (533 → 413).

## 2. Where the 257 px goes

Walked up the **canvas's own ancestor chain**, so every element counted genuinely contains the
canvas:

| from | to  | px      | what                                                                                                        |
| ---- | --- | ------- | ----------------------------------------------------------------------------------------------------------- |
| 0    | 147 | **147** | the shell chrome band (ADR-0055 S2) — app header row **56**, the portalled command band **90**, 1 px border |
| 147  | 200 | **53**  | the plan header — breadcrumb, status pill, Project-finish chip, Edit-plan, `CompactPenStatus`               |
| 200  | 216 | **16**  | workspace padding: 8 px between the header and the pane wrapper, plus that wrapper's own `padding-top: 8`   |
| 216  | 217 | **1**   | the pane's border                                                                                           |
| 217  | 257 | **40**  | the canvas pane's own DOM time-axis strip, above the `<canvas>` element                                     |
| 257  | —   |         | the canvas                                                                                                  |

Within the 147 px band, the two command rows are **45** (Row 1, incl. its 1 px rule) and **44**
(Row 2), each `py-1` around a `min-h-9` control.

## 3. What this means for M4-T2, before it is designed

**The merge can recover at most ~61 px, not ~199.** M4 folds the _plan header_ into the chrome band;
that is the 53 px row plus, at best, the 8 px of separation below it. The other 196 px are the shell's
app header row, the command rows themselves, the pane border and the canvas's own time-axis strip —
none of which the header merge touches.

61 px against a measured 533 px canvas is **+11 %**, which is a real gain and worth having. It is
also not the gain a reader would infer from `design.md` §2.1, so **M4-T2 must state the measured
number and not the design's**. That is the whole reason this task runs first.

Two related figures for whoever picks up M4-T2:

- **The app header row is 56 px — larger than either command row.** If vertical space is the goal,
  it is the single biggest recoverable band above the canvas, and it is out of this epic's scope
  (ADR-0055 territory, and shared by every screen). Worth naming rather than leaving as an implied
  target.
- **`docs/TECH_DEBT.md` #127 wants the coarse-pointer control to reach 44 px**, which would add
  ~16 px to the command band. That is the trade M4's numbers now let someone make deliberately:
  the header merge pays for it and leaves ~45 px over.

## 4. Two probes that produced numbers rather than answers

Recorded because both looked like measurements and neither was one.

**Probe 1** reported `chromeBand + planHeader = 200` against an `aboveCanvas` of 257 and would have
shipped a **57 px hole** described as "the app shell's own chrome" — a plausible sentence covering
something nobody had looked at, which is exactly the failure this task exists to prevent.

**Probe 2** listed every box geometrically inside that 57 px, and returned the Project Explorer's
`treeitem` for **Riverside**. The rail sits _beside_ the canvas, and a horizontal band cuts straight
through it: a geometric filter cannot tell a column from a row. The ancestor walk in §2 has no such
ambiguity, which is why it replaced both.
