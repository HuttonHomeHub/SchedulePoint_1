# Scaled workspace, M0: measurement record

- **Status:** Accepted — M0 readings for ADR-0222
- **Date:** 2026-11-15. **Tree:** `claude/gallant-edison-sxqblf` at `68b2c031` (web 1.16.0, api 1.5.0). **No product code was touched.**
- **Harness:** throwaway Node scripts using the pre-installed `playwright` (not in the repo, not in CI; they live in the session scratchpad
  `…/scratchpad/m0/`). Real sign-up, real API, a real Postgres, the Vite dev server. Browser: **Chrome for Testing 153.0.8010.12**,
  headless, `deviceScaleFactor` 1, fonts of this container (not CI's, not the owner's, ADR-0128). Only Chromium exists here, so nothing
  below says anything about Firefox or WebKit.
- **Fixtures:** plan "Scale plan" (five tasks in five lanes, three FS links, data date 5 Jan 2026) for the diagram, the drag and the
  overlays; plan "Long plan" (60 tasks) for the Gantt's scroll and sticky columns. The viewport notice is acknowledged through its
  `localStorage` key, so no banner adds height. The user opens each plan as a Planner and holds the pen.
- **Where a bar is:** there is no test hook, so the scripts read the canvas bitmap (`getImageData`, long runs of bar ink per row) for bar
  geometry and then click-probe. The selected activity is read from the listbox's `aria-activedescendant`. Every click is the real
  `page.mouse` at screen coordinates; nothing uses Playwright's locator `position`, which would compensate for a transform itself.
- **Method for the mechanism:** the scale is **injected style on the element**, never a code patch. The element is the workspace root
  (`main#main`'s only child, which holds the dock, diagram or Gantt, activity panel and foot row). It is given
  `flex: none; width: W/s; height: H/s` (W × H is its own box at scale 1 in that window) and `main` gets `overflow: hidden`. Then either
  (a) `transform: scale(s); transform-origin: 0 0`, or (b) `zoom: s`. Scales 0.75 and 0.8; windows 1024 × 600 and 1366 × 636.
- **Three phases for the pointer and sizing questions**, because the first one fails and the question is what would make it pass:
  - **A:** the app unmodified.
  - **B:** the app with an **emulated divide-by-scale helper**, injected as page script: `getBoundingClientRect` on the root and its
    descendants returns layout-space values (position relative to the root's origin divided by `s`, size divided by `s`), and
    `clientX/clientY` of every pointer event whose target is inside the root is mapped the same way. It is a stand-in for what
    M1 would write, not a design for it.
  - **C:** B plus `window.devicePixelRatio` reporting `s`, so the canvas's backing store is allocated at the pixels it is drawn at (the
    app reads `devicePixelRatio` at `TsldCanvas.tsx:534`).

## 1. The designed box (Task 1)

1280 × 800 window, Explorer at its default width, a Planner with the pen, five activities. Diagram and Gantt measure the same.

| Element                                                                                                                              | Box (CSS px)                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **`main#main` (`col-start-2 row-start-3`), whose single child is the workspace root `div.flex.min-h-0.flex-1.flex-col`**             | **1003 × 661**, at x 277, y 139 — identical in the Diagram and the Gantt |
| Project Explorer column (`col-start-1 row-start-3`)                                                                                  | 277 × 661                                                                |
| Chrome band row (`ChromeBandRow`, `col-span-2 row-start-2`): app header 48 + `section[aria-label="Plan command band"]` 88 + 3 border | 1280 × 139 (the band section itself 1280 × 88 at y 48)                   |
| Plan status slot (row 4)                                                                                                             | 0 × 0 (empty; the dated foot strip is inside the root)                   |
| The diagram canvas inside it                                                                                                         | 1003 × (a dock-dependent height; 362 of the 461 at 1024 × 600)           |

**The two numbers: `Wd` = 1003, `Hd` = 661** (the root, measured as `main`'s box), if the scaled unit is the root. Other windows, same
method: **1024 × 600 → 747 × 461**; **1366 × 636 → 1089 × 497**.

**Two things D2 does not say, and the reading does.**

1. **The command band is not inside the workspace root.** It is portalled into the shell's grid row 2 and spans both columns (above the
   Explorer too), with the app header in the same row. One wrapper around "the command band, the diagram, … the foot row" cannot exist
   without moving the band. Scaling the band is therefore a second wrapper on the band `section` (88 high, 1280 wide at the design size),
   not a part of the first. Menus from a band scaled alone anchor correctly (section 2), so a second wrapper is feasible.
2. **The formula `min(1, Wbox/Wd, Hbox/Hd)` on the root does not give 0.75 at 1024 × 600.** The header and band (139 px) and the
   Explorer (277 px) do not scale, so the root is only 747 × 461 there: `min(747/1003, 461/661)` = **0.745 and 0.697 → 0.697**, which is
   under D3's floor. D3 says "0.75 is what a 1024 × 600 window needs (600 / 800)"; that holds if the **window** is the quantity and is
   false for the **root's box**. At 0.75 the root is laid out 996 × 615, **46 px shorter than the designed 661**, so the diagram's 350 px
   floor and the short-window rules are not fully relieved at 1024 × 600. At 1366 × 636 the formula gives `min(1.086, 0.752)` = **0.752**.
   If the band (91 px of it, excluding the header) joins the scaled unit, `Hd` becomes 752 and 1024 × 600 needs 552/752 = 0.734. The owner
   should see these numbers before the floor and the formula are pinned in M1.

## 2. The mechanism (Task 2)

All values are CSS px unless stated. "Layout" is the box the page was told to use (`offsetWidth`); "screen" is what the pixels occupy.

### 2.1 What the browser reports (Phase A, the app unmodified)

Root at 1024 × 600, s = 0.75, both mechanisms: `offsetWidth × offsetHeight` **996 × 615**, `getBoundingClientRect` **747 × 461**.

| Reading                                               | `transform`                                             | `zoom`                                                    |
| ----------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `offsetWidth/Height` of the root and canvas           | layout (996 × 615)                                      | layout (996 × 615) — the zoomed CSS units                 |
| `getBoundingClientRect`                               | **screen** (747 × 461)                                  | **screen** (747 × 461) — the same as transform            |
| `ResizeObserver` `contentRect` of the canvas's box    | layout (996 × 555.66)                                   | layout (996 × 556)                                        |
| `devicePixelContentBoxSize` of that box               | **layout** (996 × 556): blind to the transform          | **true device pixels** (747 × 417)                        |
| `MouseEvent.clientX/Y`                                | screen                                                  | screen                                                    |
| `MouseEvent.offsetX/Y` on the canvas                  | **layout** (247, 121.5 for a point drawn at 247, 121.5) | **screen** (185.3, 91.1, i.e. × s)                        |
| Dialog inside the root, opened (1366 × 636, s = 0.75) | 672 × 503, unchanged, centred                           | **504 × 378**, i.e. scaled, though it is in the top layer |

Chrome's `zoom` coordinate model (the plan's risk row) is, in 153: rects and client coordinates are in screen px as for a transform;
`offsetWidth` is in zoomed CSS units; `offsetX` is **not** in layout px; and **zoom is inherited by every descendant, including
`<dialog>` in the top layer**. A transform keeps the top layer at real size. The workspace root holds **14 `<dialog>` elements**
(16 in the document). A rule `dialog { zoom: 1/s }` restored the 672 × 503 box in a one-off check, so zoom is workable, but it is one
compensation per kind of top-layer element, forever, and D7 ("overlays keep their real size") is true under a transform without it.

### 2.2 The app unmodified is wrong under both (Phase A)

| Window (box)                       | Mechanism, s             | Canvas box the app chose (layout) | Canvas on screen      | Clicks on a bar that select it | Drag of 300 screen px |
| ---------------------------------- | ------------------------ | --------------------------------- | --------------------- | ------------------------------ | --------------------- |
| 1024 × 600 (root 996 × 615 at .75) | none, 1                  | 747 × 362                         | 747 × 362             | 5 / 5                          | 9 days                |
|                                    | transform .75            | **747** × 377 in a 996-wide root  | 560 × 283             | **0 / 5**                      | no move               |
|                                    | transform .8             | 747 × 374 in a 934-wide root      | 598 × 299             | **0 / 5**                      | no move               |
|                                    | zoom .75, .8             | same as transform                 | 560 × 283, 598 × 299  | **0 / 5**                      | no move               |
| 1366 × 636                         | none, 1                  | 1089 × 398                        | 1089 × 398            | 5 / 5                          | 6 days                |
|                                    | transform, zoom .75 / .8 | 1089 × 413 / 410                  | 817 × 310 / 871 × 328 | **0 / 5**                      | no move               |

Two separate defects, and the second is not in the plan:

- **Pointer coordinates.** The app computes `clientX − rect.left`; at s = 0.75 a point drawn at 247 reads 185.3 (`247 × s`), under both
  mechanisms. (A "Fit out" click selected "Erect frame" once per run: a coincidence of position, not a hit.)
- **Canvas sizing.** `TsldCanvas.tsx:1909` measures its container with `getBoundingClientRect()` (`measure`, run from a
  `ResizeObserver`). That returns screen px, so the canvas was given **747 px inside a 996 px box** and drew at 560 px on screen: the
  scaled workspace did **not** fill its box. So the helper D6 describes ("every pointer-to-diagram calculation", citing `:2445`, `:2599`,
  `:2900`) is not enough; every **rect read** that feeds a layout decision needs the same conversion. App-wide there are 21 non-test
  files calling `getBoundingClientRect` and 13 using `clientX` (`grep`, 2026-11-15); the workspace's share is for M1 to count.

### 2.3 With an emulated divide-by-scale helper the same checks pass (Phase B)

| Window     | Mechanism, s        | Root layout / screen    | Canvas layout → screen                | Bars selected | App-side local x of a probe (want 247 / 355) | Drag, 300 screen px: days moved (correct = `300/(s·pitch)`; unscaled `300/pitch`) |
| ---------- | ------------------- | ----------------------- | ------------------------------------- | ------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| 1024 × 600 | none, 1             | 747 × 461               | 747 × 362 → 747 × 362                 | 5 / 5         | 247                                          | 9 (8.41 / 8.41)                                                                   |
|            | transform .75       | 996 × 615 → 747 × 461   | 996 × 516 → 747 × 387                 | 5 / 5         | 247.0                                        | **12** (11.21 / 8.41)                                                             |
|            | transform .8        | 934 × 576 → 747 × 461   | 934 × 477 → 747 × 382                 | 5 / 5         | 246.9                                        | **11** (10.51 / 8.41)                                                             |
|            | zoom .75, .8        | as transform            | 996 × 516, 934 × 478 → 747 × 387, 382 | 5 / 5         | 247.0, 246.9                                 | **12, 11**                                                                        |
| 1366 × 636 | none, 1             | 1089 × 497              | 1089 × 398                            | 5 / 5         | 355                                          | 6 (5.59 / 5.59)                                                                   |
|            | transform, zoom .75 | 1452 × 663 → 1089 × 497 | 1452 × 564 → 1089 × 423               | 5 / 5         | 355.0                                        | **8** (7.45 / 5.59)                                                               |
|            | transform, zoom .8  | 1361 × 621 → 1089 × 497 | 1361 × 522 → 1089 × 418               | 5 / 5         | 355.1                                        | **7** (6.99 / 5.59)                                                               |

The canvas now fills the root; every bar is hit; the unscaled drag moves 9 days (a 0.59-day rounding bias in the unscaled drag at this
pitch), the scaled ones 11 to 12, matching `300/(s·pitch)` plus that bias, and clearly not the 9 an uncorrected helper would give. The
on-screen distance travelled is the pointer's. Transform and zoom behave identically here.

**What this does not establish.** The emulation maps pointer events whose target is inside the root and rects of the root's descendants,
and nothing else. **Not measured:** a Gantt bar drag or resize, in-cell editing, the panel and Gantt dividers' drags, the minimap's
rectangle, touch and pen input, pointer capture across the root's edge, and the diagram's wheel zoom. A drag was measured only on the
diagram, with the pen held.

### 2.4 Overlays, anchored to a scaled control (Phase A, the app unmodified)

Menus and tooltips are portalled to `<body>` (not inside the scaled element) and positioned from the trigger's `getBoundingClientRect()`,
which is screen px under both mechanisms. So they need no conversion and stay at real size.

| Overlay (trigger)                                                                  | Result at 1024 × 600 and 1366 × 636, s = 0.75 and 0.8, both mechanisms                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gantt row menu (the row's "…", in the root)                                        | Menu 299.6 × 410 in every cell (never scaled); `menu.x − trigger.x` = 0 in all 10 cells; at 1366 `menu.y − trigger.bottom` = 0 in all (the menu opens below the scaled trigger); at 1024 × 600 the menu is 410 high and clamped to the same y (182) as unscaled, so the offset moves with the smaller trigger but the clamp is the app's own |
| Tooltip (the diagram's "Minimap" control, in the root)                             | 256 × 42, 6 px above the trigger's scaled top in every cell, right edge clamped to the window as unscaled; `<body>` child                                                                                                                                                                                                                    |
| Band menu, band scaled **alone** (first button with a menu, "Activity type: Task") | `menu.x − trigger.x` = 0 and `menu.y − trigger.bottom` = 0 in all 10 cells; menu 211.6 × 199 in all                                                                                                                                                                                                                                          |
| Dialog ("Share links", opened from the band, 1366 × 636)                           | **Scaled under `zoom`** (504 × 378 at .75, 538 × 403 at .8) and unscaled under a transform (672 × 503, centred). Not opened at 1024 × 600 because "Share…" is a menu item there                                                                                                                                                              |

No element inside the root computes `position: fixed` in the Diagram or the Gantt (idle, nothing selected), so a transform's new containing
block for fixed descendants has nothing to catch. **Not measured:** a state with a selection, a toast, or an open popover inside the root.

### 2.5 The Gantt: sticky columns and scroll (Phase A; "Long plan", 60 rows)

| Reading                                                    | transform                                                                                                         | zoom                                                                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Sticky first column's screen x after scrolling             | unchanged (277) in all 4 cells and unscaled                                                                       | unchanged (277) in all 4 cells                                                                                      |
| Sticky header's y after scrolling                          | unchanged (`headerDy` 0)                                                                                          | unchanged                                                                                                           |
| Wheel of 400 down / 200 across over the timeline           | `scrollTop` +400, `scrollLeft` +200 (**layout** px: the content moves 300 / 150 screen px, slower than the wheel) | `scrollTop` +533 / +500, `scrollLeft` +267 / +250 (**the content moves 400 / 200 screen px**, the wheel's distance) |
| Scroller `clientWidth` against `scrollWidth` at 1366 × 636 | 1452 against 1863 (s .75), 1361 against 1727 (.8): the layout box, scrolls as unscaled                            | the same                                                                                                            |

Sticky positioning and scrolling work under both. They differ in feel only: wheel and trackpad travel is divided by `s` under a
transform and is the finger's distance under `zoom`.

### 2.6 Canvas sharpness (Phase B against Phase C, at 1024 × 600)

A crop of "Pour slab", its bar and its end date, 4× nearest-neighbour, is `sharp-sheet-0.75.png` in the scratchpad (rows: unscaled; B
transform; B zoom; C transform; C zoom).

- **Transform and zoom produce the same pixels** at 0.75 (difference image: max 0, 0 of 11,000 pixels), and nearly the same at 0.8 (max 25
  in C, 63 in B: sub-pixel placement of the canvas's box).
- **What decides sharpness is the backing store, not the mechanism.** As the app sizes it today (B: backing = layout px, 996 × 516) the
  browser resamples it by 0.75 and the bar's edge in a column through it reads `174 165 217 217 221 89 53 53 53 77` (light halo pixels on one side, an uneven edge).
  With the backing store at the pixels drawn (C: 747 × 387), the same column reads `219 155 101 53 53 53 101` (a 4.5 px bar with two clean edge pixels).
  The text is visibly crisper in C. Neither is blurred to the point of illegibility at 0.75; text is about 9 px either way.
- D6's second bullet (each canvas sizes its backing store to the pixels it is drawn at) is therefore worth doing and is cheap: the app
  already multiplies by `devicePixelRatio` (clamped to 2 at `TsldCanvas.tsx:534`); a workspace-scale factor beside it is all C did.
  Under `zoom` the browser also hands over the true pixel size through `devicePixelContentBoxSize`; under a transform it does not, so the
  scale has to be passed in.

## 3. Zoom and text signals (Task 3)

Page `…/plans/…` at 1280 × 800. "Root" is `getComputedStyle(documentElement).fontSize`.

| Condition                                                  | Root font | `innerWidth`            | `outerWidth` | `devicePixelRatio`             | `visualViewport.scale`                 | `outerWidth / innerWidth`                 | Is it page zoom?                                                                                                           |
| ---------------------------------------------------------- | --------- | ----------------------- | ------------ | ------------------------------ | -------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Default                                                    | 16 px     | 1280                    | 1280         | 1                              | 1                                      | 1                                         | n/a                                                                                                                        |
| CDP `Page.setFontSizes` standard 32                        | **32 px** | 1280                    | 1280         | 1                              | 1                                      | 1                                         | **No**: a text-size setting; the root reads 2×, the window does not move                                                   |
| Injected style `html { font-size: 200% }`                  | **32 px** | 1280                    | 1280         | 1                              | 1                                      | 1                                         | **No**: same signature as the CDP route                                                                                    |
| CDP `Emulation.setPageScaleFactor` 1.25                    | 16 px     | 1280                    | 1280         | 1                              | **1.25** (`visualViewport.width` 1024) | 1                                         | **No**: pinch zoom; the layout box is unchanged                                                                            |
| CDP `Emulation.setDeviceMetricsOverride` dsf 1.25          | 16 px     | 1280                    | 1280         | **1.25**                       | 1                                      | 1                                         | **No**: a denser display, not a zoom                                                                                       |
| CDP `Emulation.setDeviceMetricsOverride` 1024 × 640, dsf 1 | 16 px     | **1024**                | 1280         | 1                              | 1                                      | 1.25 (1280 against 1024, by construction) | **No**: a size emulation. It gives the CSS size of 125 % zoom with no zoom signal in it, which is exactly ADR-0222's catch |
| Launch flag `--force-device-scale-factor=1.25` and `=2`    | 16 px     | 1280                    | 1280         | 1 (no effect in headless here) | 1                                      | 1                                         | **No**                                                                                                                     |
| Keyboard `Control+Equal` ×3, headless                      | 16 px     | 1280                    | 1280         | 1                              | 1                                      | 1                                         | **No**: CDP key events do not reach browser accelerators                                                                   |
| Keyboard `Control+Equal` ×3, headed under Xvfb             | 16 px     | 1050 (before and after) | 1050         | 1                              | 1                                      | 1                                         | **No**: same; headed does launch here (`xvfb-run`), `outerHeight − innerHeight` = 87 (browser chrome), no side frame       |
| **Profile `Preferences`: zoom level 1 (factor 1.2)**       | 16 px     | **1067**                | 1280         | **1.2**                        | 1                                      | **1.2**                                   | **Yes**                                                                                                                    |
| **Profile `Preferences`: zoom level 2 (factor 1.44)**      | 16 px     | **889**                 | 1280         | **1.44**                       | 1                                      | **1.44**                                  | **Yes**                                                                                                                    |
| **Profile `Preferences`: zoom level −1 (factor 0.833)**    | 16 px     | **1536**                | 1280         | **0.833**                      | 1                                      | **0.833**                                 | **Yes**                                                                                                                    |

The real zoom is produced by writing `partition.default_zoom_level.x` and `partition.per_host_zoom_levels.x.localhost.zoom_level` into
`<profile>/Default/Preferences` before launch and opening the profile with `launchPersistentContext(dir, { viewport: null })`. The result
is the same in headless and in headed (Xvfb): `window-size` 1280 × 800 gave `innerWidth` 1280 / 1067 / 889 / 1536 and `outerWidth` 1280 each time.
The factor is 1.2 to the power of the level, so a real "125 %" is not a stored level (110 % and 125 % are reachable by a fractional level, not tried).

What the signals say, in Chromium: **zoom is visible as `outerWidth / innerWidth` (and as `devicePixelRatio`)**, and exactly so
(1.200, 1.440, 0.833 to three places). A larger text size is visible as the root font size and does not touch the ratio, so the two are
told apart, as D4 items 1 and 2 need. **`devicePixelRatio` alone is not safe**: a 125 % display at 100 % zoom reports 1.25 too (as the
`setDeviceMetricsOverride` row shows); the ratio of `outerWidth` to `innerWidth` is the discriminating signal.

**Caveats that are not measured.**

- This container has no window manager, so the browser window had no side borders. A real desktop window has them (about 16 px
  on Windows), so the ratio at 100 % zoom there is a little over 1 (about 1.01 at 1280), and a detector needs a tolerance, not equality.
  ADR-0179's 132 px of vertical overhead is the owner's machine; the horizontal one is unmeasured.
- Firefox reports screen sizes in zoom-scaled CSS px (Mozilla bug 1292571, as ADR-0222 notes) and Safari reports differently again. Neither
  is installed, so the signal is verified for Chromium only. D4 item 3 (the switch) is what covers them, as the ADR already says.
- A seeded-profile journey is possible (`launchPersistentContext` with a written `Preferences`), which means the guard in D10 can drive a
  **real** browser zoom rather than a text-size stand-in. It needs a persistent context rather than the suite's usual one; that is a
  Playwright config question for M1 and ADR-0105 applies to it.

## 4. Verdicts on the plan's stop rules

### (a) Does one mechanism keep clicks, drags and menus correct with a single divide-by-scale helper?

**The rule does not fire. Either mechanism works, with a larger helper than the plan assumes.**

- **Yes for clicks and drags**, under both mechanisms, once client coordinates **and rect reads** are converted: 5 of 5 bars hit and
  drags travel the pointer's distance in every one of the 10 emulated cells (Phase B), against 0 of 5 and no drag with the app unmodified.
- **Yes for menus and tooltips** with no conversion at all: they are portalled to `<body>`, anchored by the trigger's screen rect, and
  stayed at real size and on their trigger in every cell (2.4).
- **But the helper is not "pointer-to-diagram" only.** The canvas sizes itself from `getBoundingClientRect()` (`TsldCanvas.tsx:1909`),
  so an unconverted app draws a canvas smaller than its box (747 in 996). D6 and D5 must say that every rect read feeding layout,
  hit-testing or positioning inside the workspace goes through the same module, and M1 needs a count of those sites (21 files call
  `getBoundingClientRect` app-wide, 13 read `clientX`; a structural test like ADR-0213 D4's would pin the list).
- **Not covered by this reading:** the Gantt's own drags, dividers, the minimap, touch and pen, and Firefox/WebKit (stated in 2.3).

**Recommendation: `transform: scale()`.** Reasons, in order:

1. **D7 holds without work.** Under `zoom` the 14 `<dialog>` elements the workspace root contains are scaled with it (672 × 503 became
   504 × 378), although they are in the top layer; a transform leaves them at real size, centred in the window. `zoom` would need a
   compensating rule for every top-layer element, including ones added later.
2. **A transform's behaviour is the long-standing one.** `zoom` changed its coordinate model in 2024 (the plan's risk row), and how the other
   engines treat it cannot be checked here; the measured 153 behaviour (rects in screen px,
   `offsetX` in screen px, `devicePixelContentBoxSize` in device px) differs from a transform's in exactly the places a helper reads.
   `offsetX` is layout px under a transform and screen px under zoom, so code that happens to use `offsetX` would be right in one and wrong
   in the other; the helper should read client coordinates only.
3. **Output is the same.** Pixel-identical at 0.75, within sub-pixel placement at 0.8 (2.6), so zoom buys nothing visible.

What a transform costs, so it is chosen with open eyes: wheel and trackpad travel in the Gantt is divided by `s` (a wheel of 400 moves
the content 300 px at 0.75); the wrapper must be given its layout size explicitly (box/s) with the parent clipping, because a transform does not
change layout; it creates a containing block for `position: fixed` descendants (none were found in the idle states, 2.4); and the
backing store has to be told the scale (`devicePixelContentBoxSize` ignores a transform), which Phase C shows is one multiplication.
`zoom`'s advantages are the wheel feel, the device-pixel size for free, and no containing-block change; none outweighs the dialogs.

### (b) Can browser zoom be simulated or detected in this Chromium?

**It does not fire: yes, a real page zoom can be produced here, and Chromium reports it.** A seeded profile `Preferences` gives true browser zoom
in headless and headed-under-Xvfb, with `outerWidth / innerWidth` = the zoom to three places and `devicePixelRatio` following it. The
ways that are **not** real page zoom, stated plainly: `Page.setFontSizes` and a `font-size: 200%` style sheet (text size only);
`Emulation.setPageScaleFactor` (pinch zoom: `visualViewport.scale` only); `Emulation.setDeviceMetricsOverride` (a denser display, or a
smaller CSS window with no signal, which is the catch itself); `--force-device-scale-factor` (no effect in this headless build); and
`Control+=` through Playwright (CDP key events never reach the browser's zoom accelerator, headless or headed). D4 item 2 is sound for
Chromium on the evidence above, with the window-border tolerance as the open detail. It is **unverified for Firefox and WebKit**, so
D4 item 3 stays what carries the guarantee there.

## 5. Surprises, for the owner

1. **The 0.75 floor does not fit a 1024 × 600 window by the ADR's own formula** (section 1): the root's box there is 747 × 461, which needs 0.697.
2. **The command band is outside the workspace root**, in the shell's row 2 and spanning the Explorer's column. The "one wrapper" in D2/D6
   is two wrappers, or a moved band.
3. **The canvas sizes itself from screen px**, so rect reads, not only pointer reads, need conversion (2.2).
4. **`zoom` scales top-layer dialogs inside the root; a transform does not.** This is the deciding fact for the mechanism.
5. **Real browser zoom can be reproduced here** by seeding a Chromium profile, which the plan and ADR-0222 ("headless Chromium has a text-size
   setting but no page zoom") say cannot be done. The D10 guard can use the real thing, subject to a Playwright config change.
6. The Gantt scrolls `s` times slower per wheel notch under a transform.

## 6. What was not measured

Firefox, WebKit, a real touch screen and a real pen; a real window's side frame (so the zoom ratio's tolerance); fractional zoom levels
(110 %, 125 %); the Gantt's bar drag, resize, in-cell edit and both dividers under a scale; the minimap; a selection, toast or popover
inside the root under a transform (containing block for `position: fixed`); the app under a scale at the real floor with the rest of its
short-window rules firing (D5's conversions are M1); frame cost of a scaled canvas (no timing was taken). The dialog compensation
`dialog { zoom: 1/s }` was checked once, at 1366 × 636 and 0.75, and not across the matrix.
