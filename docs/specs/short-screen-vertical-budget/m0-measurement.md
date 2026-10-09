# M0 — Measurement record: the activities panel on a short screen

Evidence for [`implementation-plan.md`](implementation-plan.md) M0 (ADR-0113, ADR-0142). Nothing here changes the
product. The label-width readings the plan lists are **not taken**: Part B's label drop is not being built (only
the Settings gear icon is), so `deckLabel`, the compact-trigger widths and the DO row's spare are out of scope.

## How the readings were taken

- **Date:** 2026-10-08. **Browser:** the container's Chromium (`/opt/pw-browsers/chromium-1194`), driven by
  Playwright against the real API and the Vite dev server. **Layout only**: not the target hardware, no frame-rate
  claim (M0-T1's own risk).
- **Fixture:** a fresh organisation, client, project and plan, twelve activities seeded through the public REST API
  (one per lane, 3 d each), recalculated, the pen taken, the Explorer at its default width (276). The panel was
  expanded with the real **Expand activities panel** control and read after 600 ms.
- **Harness:** a throwaway Playwright spec and config outside the committed tree, **not committed** (a committed one
  needs its own Playwright config, an ADR-0105 trigger). Coarse cells are a context with `hasTouch: true`;
  `matchMedia('(pointer: coarse)')` was read in every cell (`false` fine, `true` coarse).
- **Reading each part:** `PANEL_HEADER_PX` is the height of the panel `<section>`'s first child; `PANEL_FOOT_PX` its
  last child (the foot row); `PANEL_BODY_PAD_PX` is the computed `padding-top + padding-bottom` of
  `[data-testid="activities-panel-body"]`; `TABLE_HEAD_PX` is the `<thead>` height; `ROW_PX` is the height of the
  first rendered `<tbody>` row with a non-zero height (the first `<tr>` is the windowing spacer, height 0). **Body
  height** is the workspace body element that `plan-workspace-toolbar.tsx:688-700` observes (`bodyRef`).

## 1. Body height and the parts

Heights in CSS px. "Body" is `bodyHeight` (what `isShortBody` will read). It is the same collapsed and expanded
(checked: the ancestor chain of the ruler reads the same body in both states).

| Pointer | Viewport    | Body | Header | Foot | Pad | Table head | Row | Panel box today | Rows hit-testable today |
| ------- | ----------- | ---- | ------ | ---- | --- | ---------- | --- | --------------- | ----------------------- |
| fine    | 1024 × 600  | 365  | 52     | 51   | 16  | 57         | 57  | 140             | **0**                   |
| fine    | 1024 × 768  | 533  | 52     | 51   | 16  | 57         | 57  | 280             | 2                       |
| fine    | 1280 × 720  | 573  | 52     | 51   | 16  | 57         | 57  | 280             | 2                       |
| fine    | 1280 × 800  | 653  | 52     | 51   | 16  | 57         | 57  | 280             | 2                       |
| fine    | 1912 × 948  | 801  | 52     | 51   | 16  | 37         | 45  | 280             | 3                       |
| coarse  | 1024 × 600  | 329  | 60     | 55   | 16  | 57         | 57  | 140             | **0**                   |
| coarse  | 1912 × 1114 | 947  | 60     | 55   | 16  | 37         | 45  | 280             | 2                       |

(Coarse 1024 × 768, taken in a second pass: body 497, head 57, row 57, header 60, foot 55.)

Collapsed canvas heights at the same cells, for reference: fine 274 / 442 / 482 / 562 / 710 and coarse 234 / 852. The
fine 1024 × 600 and coarse 1024 × 600 figures reproduce `minimum-viewport/m4-measurement.md` (274 and 234).

**What the table says about the parts:**

- **Header and foot** are pointer-keyed and match the spec: header 52 fine / 60 coarse (estimate 48 / 60), foot
  51 / 55, pad 16 / 16.
- **Table head and row are NOT pointer-keyed; they are width-keyed.** At 1024 and 1280 wide (a 747 px and 1004 px
  stage) the head and the rows are **57 px** on both pointers, because cells wrap: 15 columns at 28–96 px
  (`Early start` and `07 Jan 2026` in a 96 px cell, `py-2 pr-4`). At 1912 wide the head is 37 and the row 45, again
  on both pointers. The spec's estimates (head ≈ 32 / 36, row ≈ 35 / 44) are low by 21–25 px at the widths the swap
  exists for. A fine pointer's row at 1912 is 45, not 35.
- A swapped panel's rows therefore cost 57 px at the floor, not 35 / 44.

## 2. Does a hidden → shown canvas keep its viewport?

Setting `hidden` on the canvas row at 1280 × 800 (fine), after a wheel zoom and a horizontal pan had settled, then
removing it:

- The canvas backing bitmap goes **1003 × 562 → 1 × 1 → 1003 × 562**: `measure()` clamps the 0 × 0 rect and
  reallocates, as `TsldCanvas.tsx:1580-1605` reads.
- The pxPerDay and originX are **kept**: all 19 ruler elements (years, months, day ticks, each with its
  `translateX`) are identical before and after, once the zoom animation had settled (the ruler is derived from
  `viewRef`'s `originX` and `pxPerDay`, `TsldCanvas.tsx:1643-1665`). A first run that did not wait for the animation
  reported a difference; it was the animation, not the round trip, and the settled run is the one recorded.
- **`originY` is not directly observed** (the ruler is horizontal). Reading `measure()` it is not written by the
  resize path (the comment at `TsldCanvas.tsx:1625-1629` says the viewport is preserved), but this is a reading of
  code for that one field, not a measurement.
- So SC-A4 holds today for `originX` and `pxPerDay` **even without** the planned 0 × 0 early return. The guard is
  still worthwhile (it avoids two reallocations and a 1 × 1 `setMinimapRoom` read), but it is not what protects the
  viewport, and the unit test should be worded as "no reallocation", not "viewport survives".

## 3. Suites that would swap once A1 lands (derived)

`grep -rl "Expand activities panel" apps/web/e2e*` returns 18 files in 15 directories:

```text
e2e/workspace.ts                         e2e-activity-editor/support.ts      e2e-assignment-lag/support.ts
e2e-audit/audit.spec.ts                  e2e-edit/support.ts                 e2e-narrow-shell/narrow-shell.spec.ts
e2e-notes/support.ts                     e2e-programme/support.ts            e2e-resource-view/support.ts
e2e-sub-day/support.ts                   e2e-toolbar/support.ts              e2e-toolbar/toolbar.spec.ts
e2e-undo/support.ts                      e2e-wbs/support.ts                  e2e-workspace-chrome/{activities-panel-scroll,
                                                                              dock,progress-entry}.spec.ts
e2e-workspace-fit/command-surface.spec.ts
```

Each config's viewport (`grep viewport apps/web/playwright*.config.ts`; a config with none inherits Playwright's
`Desktop Chrome` 1280 × 720):

| Suite (directory)                                               | Config viewport                     | Body (fine) | Swaps at the default?                                                      |
| --------------------------------------------------------------- | ----------------------------------- | ----------- | -------------------------------------------------------------------------- |
| `e2e/` (base journey; 5 specs use `workspace.ts`)               | none, so **1280 × 720**             | 573         | **yes**                                                                    |
| `e2e-edit/`                                                     | none, so **1280 × 720**             | 573         | **yes**                                                                    |
| `e2e-notes/`                                                    | none, so **1280 × 720**             | 573         | **yes**                                                                    |
| `e2e-programme/`                                                | none, so **1280 × 720**             | 573         | **yes**                                                                    |
| `e2e-toolbar/`                                                  | none, so **1280 × 720**             | 573         | **yes**, and `toolbar.spec.ts:169` sets 1280 × 520 explicitly (swaps more) |
| `e2e-undo/`                                                     | none, so **1280 × 720**             | 573         | **yes**                                                                    |
| `e2e-activity-editor/`                                          | 1440 × 900                          | > 653       | no                                                                         |
| `e2e-assignment-lag/`, `e2e-audit/`, `e2e-sub-day/`, `e2e-wbs/` | 1920 × 1080                         | > 653       | no                                                                         |
| `e2e-resource-view/`                                            | 2304 × 1080                         | > 653       | no                                                                         |
| `e2e-workspace-chrome/`, `e2e-workspace-fit/`                   | 1646 × 1097 (some tests set others) | > 653       | no at the config; see below                                                |
| `e2e-narrow-shell/`                                             | 640 × 480 (sets 1200–1440 × 900)    | n/a         | no: below `md` it is single-pane; 1200–1440 × 900 is tall                  |

**Six suites** (the base journey counts as one) press Expand at 1280 × 720: `e2e`, `e2e-edit`, `e2e-notes`,
`e2e-programme`, `e2e-toolbar` and `e2e-undo`. The base journey also runs under firefox and webkit projects in CI,
which use their own default viewport (`Desktop Firefox` / `Desktop Safari`, also 1280 × 720). Within the 1646 × 1097
suites, the tests that set a short height themselves (`e2e-workspace-fit/command-surface.spec.ts` at 1024 × 600,
`dock.spec.ts` at 1646 × 900 and 700 × 900) are already authored for a short or narrow body; M-A re-reads them.

## 4. Comparison with the spec's estimates (M0-T2)

| Quantity                          | Spec estimate        | Reading (fine / coarse)                                                                | Disagreement                        |
| --------------------------------- | -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| `PANEL_HEADER_PX`                 | ≈ 48 / ≈ 60          | 52 / 60                                                                                | +4 fine                             |
| `PANEL_FOOT_PX`                   | 51 / ≈ 55            | 51 / 55                                                                                | none                                |
| `PANEL_BODY_PAD_PX`               | 16 / 16              | 16 / 16                                                                                | none                                |
| `TABLE_HEAD_PX`                   | ≈ 32 / ≈ 36          | 57 at ≤ 1280 wide, 37 at 1912                                                          | **+21 to +25** at the swap's widths |
| `ROW_PX`                          | ≈ 35 / ≈ 44          | 57 at ≤ 1280 wide, 45 at 1912                                                          | **+13 to +22**                      |
| `PANEL_MIN_OPEN` (+1 row)         | ≈ 207                | 233 fine, 245 coarse (at 1024-1280 wide)                                               | **+26 / +38**                       |
| `PANEL_USEFUL_MIN` (+3 rows)      | ≈ 299                | 347 fine, 359 coarse                                                                   | **+48 / +60**                       |
| Swap threshold, `240 + USEFUL`    | ≈ 539                | ≈ 587 fine, ≈ 599 coarse                                                               | **+48 / +60**                       |
| Body at 1024 × 600                | ≈ 325 / ≈ 289        | 365 / 329                                                                              | +40 (the 40 px view-controls strip) |
| Body at 1280 × 720                | ≈ 533                | 573                                                                                    | +40, same cause                     |
| Body − 240 vs threshold, 1280×720 | 533 − 539 = −6       | 573 − 587 = −14 fine; 573 − 599 = −26 using one constant                               | swap still fires, by more           |
| SC-A1 rows at the floor           | ≈ 5 fine, 2-3 coarse | (365 − 52 − 51 − 16 − 57) / 57 = 3.3 fine; (329 − 60 − 55 − 16 − 57) / 57 = 2.5 coarse | **fewer**; still ≥ 3 / ≥ 2          |

The spec's body estimates (325 / 289) were built from the collapsed canvas plus the foot and left out the 40 px
view-controls strip above the canvas (the chain reads 40 + 482 canvas row + 51 foot). That is a constant error and it
points the same way at every viewport.

**Does any reading move the recommendation?** A1 still meets SC-A1 (3.3 fine rows, 2.5 coarse; the constants were later raised, ROW_PX 57->61 when the activities row's ⋯ grows to 44 on touch (dense-row-touch-targets M1), making the coarse figure 2.2 and the line 611), the swap still fires
at 1280 × 720, and the suite list is six, not "large". What moves is the **numbers and one assumption the spec rests
on**:

1. `PANEL_MIN_OPEN` / `PANEL_USEFUL_MIN` / the threshold are 26-60 px higher than the spec states, so
   `ROW_PX` and `TABLE_HEAD_PX` cannot be the spec's pointer-keyed pair. They are keyed on **stage width**, and one
   constant sized for the narrow case (57) over-reserves at 1912 wide (45) by 12 px a row.
2. Two things the spec states as "no swap" change with the larger threshold. 1280 × 800 fine (body 653) still does
   not swap. **Coarse 1280 × 800 was not read**, but its deck is four lines (M4: canvas 434 against 562 fine), which
   puts its body near 525, **under** a 599 threshold; SC-A3 names only the fine reading at that size.
3. The spec's plain-English "about 5 rows with a mouse" at 1024 × 600 is about 3.

These are for the caller to accept or send back to CQ-A before M-A is built. This record changes nothing in the
design; the spec still says what it said.

**An alternative the readings expose, not recommended here:** the 57 px head and rows come from cell wrapping at
1024-1280 wide. A no-wrap head and fixed row height would give the 37 / 45 px figures at every width, reduce the
threshold to ≈ 240 + (52 + 51 + 16 + 37 + 3 × 45 → 291) ≈ 531-543 and make the swap less eager. That restructures the
table, not the panel, and is outside this spec's surface; it is noted so the choice is made with the number.
