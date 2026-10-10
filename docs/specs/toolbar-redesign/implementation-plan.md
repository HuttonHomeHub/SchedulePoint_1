# Implementation Plan: Toolbar redesign for a laptop, Surface Pro and monitor-first app

- **Feature spec:** [`feature-spec.md`](feature-spec.md)
- **Status:** Approved (the product owner approved the whole plan to run to completion on 2026-10-09; OD-1 and OD-2
  in spec §0.2 were decided after M0 the same day)
- **Owner:** web
- **M0:** done (`m0-measurement.md`, commit `0044ee1`). It returned **no-go for M1 as written**; this revision
  answers it (spec §0).

## Breakdown

The product owner's answers are **gates**: a milestone does not start until its gate is closed. CQ-1, CQ-2, CQ-3 and
the free-space requirement were decided on 2026-10-09, and CQ-4 later the same day. **No product gate is open.**

```mermaid
flowchart LR
  M0[M0 Measure: DONE, no-go as written] --> A[Spec revision 4 + OD-1/OD-2]
  A --> M1
  Q2[[CQ-2 + OD-1: 4 compact items]] --> M1[M1 Label-only: docs fixes, dead ladder, label API; line count unchanged]
  M1 --> M2[M2 Relocations: identity row, Panels, Float paths, View panel 3 columns]
  Q3[[CQ-3 decided: narrow only]] --> M3[M3 Below 1024: scrolling line, #471]
  M1 --> M3
  Q1[[CQ-1 decided: corner cluster]] --> M4[M4 Diagram-corner cluster: 2 lines at the floor first asserted here]
  M2 --> M4
  QF[[Free-space requirement]] --> M5[M5 Promotion ladder]
  M3 --> M5
  M4 --> M5
  Q4[[CQ-4 decided: org ghost button + menu]] --> M6V5[M6 V5: org switcher]
  M5 --> M6[M6 Visual brief V1-V7]
  M6 --> M7[M7 Close-out: ADR, docs, counts]
```

### Epic

**Toolbar redesign.** Both toolbars are re-laid for a 1024 × 600-and-up product:

- two command rows, each one line at the floor;
- every tool on its subject's surface;
- labels that give way by declaration;
- spare width filled by promoting menu commands;
- a usable band in narrow windows.

**For every milestone:**

- No flag (ADR-0088 D1).
- Each milestone is a commit boundary that names its entry point or ships dark (ADR-0081).
- Run `pnpm prepush` plus `scripts/e2e-local.sh web:<suite>` for every changed journey before pushing.
- The **builder** agent implements; there is no schema, so database-architect is not involved.
- Re-read every `file:line` cited here before using it.

---

### Milestone M0: Measure and verify the premises (ships dark) — DONE

**Result (commit `0044ee1`):** `m0-measurement.md` and provisional `promotion-widths.{fine,coarse}.json`. **No-go
for M1 as written**:

- LOOK at the floor misses by 86.9 px without Float paths moved, and by 69.1 with a conflict even with it;
- coarse 1024 is 4 lines;
- M1 alone cannot reach two lines.

Answered by spec §0: Float paths moves (D-c), Resource view becomes the fourth compact item (OD-1), touch accepts 4
lines at 1024 (OD-2), and two lines are claimed only from M4. The task text below is kept as the record of what
was asked.

**Outcome (as planned):** `docs/specs/toolbar-redesign/m0-measurement.md`, `promotion-widths.fine.json`,
`promotion-widths.coarse.json` and a go/no-go.
**Entry point:** `Ships dark: a measurement record and a harness spec.`
**Journey:** none (a harness, ADR-0081 §3).

##### Task M0-T1: the harness and readings (≈ one PR)

- **Description:** `apps/web/measure-toolbar/toolbar-redesign-m0.spec.ts` in the existing **non-CI**
  `playwright.measure-toolbar.config.ts`.
- **Complexity:** M
- **Run with:**
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome DATABASE_URL=postgresql://app:app@localhost:5432/app_test pnpm --filter @repo/web measure:toolbar -- toolbar-redesign-m0`
- **Cells:**
  - the requested 1024 × 600, 1280 × 800, 1440 × 900 and 1912 × 1080;
  - the product owner's 1912 × 948 and 1912 × 1114;
  - 1280 × 600 and 1366 × 768 (short but wide, CQ-3);
  - 2560 × 1440;
  - #471's 640 × 480, 640 × 360, 640 × 300, 320 × 720 and 320 × 256;
  - 1280 × 800 and 2560 × 1440 at text-only 200 %, set as the browser's **default font size** (Chromium DevTools
    protocol `Page.setFontSizes`, standard 32). A CSS `html { font-size }` does not move rem media queries, so it
    would not exercise the stages.

  Every cell on **both pointers**.

- **Stress states:** the base state; conflicts present (chip shown); pen held by a peer; no computed diagram; Gantt
  view; a dock open; minimap open; a selection present.
- **What it reads:**
  - header, band, deck lines (overall and per row), `<main>` top, canvas height, foot height, and whether Expand and
    Recalculate are hit-testable;
  - **per row, the unused width** (SC-17 "before");
  - per item: id, row, group, x, y, width, label shown, tooltip present;
  - per menu: item names, and the panel height at 1024 × 600 (View must reach SC-13);
  - any group seam at the start of a line (SC-12);
  - the minimap's box and its `bottom` offset (`TsldMinimap.tsx:400`), and when `minimapRoom` turns false
    (`TsldCanvas.tsx:889`, `:2685`);
  - the stage's horizontal scrollbar and the ruler's rects, for the corner column's geometry rule;
  - **coarse:** the cluster at 44 px and the C1 presets' width;
  - **search-field growth:** its width at each stage, and the 2560 grown width.
- **Development steps:**
  1. Write the spec and run it.
  2. Write the record with **§0 "what contradicts the spec"** first.

##### Task M0-T2: premises (same PR)

1. **Compact set at the floor:** with CQ-1 applied (zoom gone), the three compact items, Summary moved and Comments
   in Panels, is each row one line at 1024 × 600 in **every** stress state?
   **Exit rule:** if any row misses by less than 20 px in any state, **stop and ask** rather than compacting a
   fourth item.
2. **`--container-roomy`:** derived from the first promotion stage (the deck width at `PROMOTE_80` minus insets).
   Confirm that every row is one line with every label visible at that width; if it is not, stop and ask.
3. **The Gantt route for Float paths:** does `GanttRowMenu.tsx` mirror the selection bar's object actions? Is
   `selection-actions.tsx:206` ("the Gantt renders no selection bar") still true? Decide D-c.
4. **Tailwind v4:** confirm the `@container/deck` and `@max-roomy/deck:` syntax and the `--container-*` theme
   token in the installed version. Register a dependency claim if a docblock will assert it.
5. **Provisional `promotion-widths.{fine,coarse}.json`:**
   - measure every ladder entry's **promoted form** on both pointers, using a local, uncommitted run with every
     entry set to `at: 'always'` at 3840 × 1440;
   - compute widths under the label state that applies at each stage;
   - propose each entry's stage with the skip-fill rule (spec §4.11).

   These JSON files are re-taken after M4, before M5, and checked by CI from then on (SC-18 (a)).

6. **Suite impact:** every test that locates a moved or promotable control by name, with `file:line`.
7. Replace every estimate in the spec with a reading.

---

### Milestone M1: Docs first, the dead ladder, one label rule — label-only (gate: CQ-2 + OD-1)

**Outcome:** M1 is **behaviour-neutral apart from labels**:

- below `--container-roomy` (79 rem), Baseline overlay, Comments, Settings and Resource view show their icon only;
- Resource view takes the `ChartColumnStacked` glyph and a description tooltip;
- one resolver and one helper decide every label.

**The deck's line count does not change at M1** (M0 §0.3: LOOK 1146.9 and DO 1119.2 at 1024 after labels alone).
Two lines at the floor are asserted at M4.
**Entry point:** the "Plan commands" toolbar at 1024 × 600.
**Journey:** `e2e-workspace-fit/command-surface.spec.ts`, which asserts only what holds at M1:

- `LINES[1024]` **stays `{ max: 4 }`** (unchanged), and a coarse 1024 cell at ≤ 4;
- the 1280 and above LINES bounds are unchanged;
- the four compact items keep their names, show their description tooltips on hover and focus, and Escape
  dismisses them;
- every compact item's label is visible at 1280 (79 rem and up);
- 2.5.3 label-in-name;
- a 2560 × 1440 text-only 200 % cell (80 rem; browser default font size via `Page.setFontSizes`, not CSS) where
  every deck control is hit-testable.

The 1280 × 800 text-only cell (40 rem; band 88 % fine / 127 % coarse today, foot row unreachable on coarse, M0 §8)
is **M3's** assertion, and "no leading seam" (SC-12) is **M6 V2's**: neither holds at M1.

> **M1 result (2026-10-09), recorded where the plan and the code disagreed.** Built as listed, with
> one deliberate deviation: **`apply-levelling` stays `'never'` at M1** and becomes `'roomy'` in M2.
> T3 says to make it `'roomy'` now, and doing that is not behaviour-neutral. Labelling it at 79 rem
> and wider adds its ~150 px label to a DO row that still carries Summary and Comments (they leave in
> M2), so DO wraps and `LINES[1280]` goes from 2 to 3. The journey this milestone is held to says the
> 1280 bound is unchanged, so the journey wins. D-l is delivered in M2-T1/T2, when those two controls
> have left DO. The `'roomy'` set at M1 is therefore **four** (the CQ-2 + OD-1 set), and the
> structural test pins that set.
>
> **M1 also records why the native `title` is KEPT on always-labelled buttons** (ADR-0117, the
> labelled branch of `ToolbarButton`). A labelled button's name is already painted, so its `title`
> carries only the supplementary clause: a live `description`, or the reason while shaded. Removing
> it would drop that tip from every labelled button. The Tooltip primitive is used only where the
> label can be absent (`'hidden'` / `'roomy'`), and exactly one channel is live per button.

##### Task M1-T1: the stale lines first (≈ one PR, docs and comments only)

- **Lines to fix:**
  - `DESIGN_SYSTEM.md:236-241`, `:255-258`, `:304-308`;
  - `Deck.tsx:61`;
  - `tsld-toolbar-items.tsx:2658`, `:3150-3153`;
  - `plan-workspace-toolbar.tsx:2143`, `:2271`;
  - `toolbar-band.tsx:11-16`;
  - `app-header.tsx:131-133`.
- **Complexity:** S
- **Testing:** `pnpm prepush` (the format and check gates).

##### Task M1-T2: delete the dead ladder (≈ one PR)

- **Delete:**
  - the bands, `resolveLayoutMode`, `bandIsAtLeast`;
  - `ToolbarLayoutEnv.layout` and `ToolbarItemRenderApi.layout`;
  - `isVisible`'s `env` argument;
  - `priority`, `priorityOf`, `partitionByTier`, the tier guard;
  - `triggersAreCompact` and every `compact` prop.
- **The ADR position:** this completes ADR-0109's supersession of ADR-0090 D6 and ADR-0091 D3a, and **overturns
  #193's keep** (ADR-0110 M5), noted in the PR.
- **Consumers to update:** `Toolbar.tsx`, `Toolbar.test.tsx`, `toolbar-registry.test.ts`, `toolbar-band.tsx`,
  `GanttRowMenu.tsx`, `GanttPanel.tsx`, `measure-toolbar/m1-icon-only.spec.ts`, and every `isVisible` caller
  (found by typecheck).
- **Complexity:** M
- **Risks:** behaviour-neutral by construction (every band resolves to `comfortable` today). Existing suites must
  pass unchanged.
- **Testing:** delete the removed functions' tests.

##### Task M1-T3: the label API (≈ one PR)

- **Description:**
  - `labelVisibility: 'always' | 'never' | 'roomy'`; `'auto'` becomes `'always'`, which is the default;
  - one `resolveLabelVisibility` and one `toolbarLabelClass` / `<ToolbarLabel>` in `toolbar-styles.ts`;
  - `ToolbarButton`, `ToolbarPopover`, `ToolbarSplitButton` and the custom triggers all use it;
  - `Deck` gets `@container/deck` on its full-width block wrapper;
  - `Toolbar` treats `'roomy'` as `'always'`;
  - `ICON_ONLY` is deleted: its members become `'never'`, except `apply-levelling`, which becomes `'roomy'`
    (D-l); `print` is dropped;
  - `--container-roomy: 79rem` goes in `@theme`, with a docblock citing M0 §4.2 (the deck at 1280 is 1264 px);
  - the compact set is **four**: Baseline overlay, Comments, Settings, and **Resource view** (OD-1);
  - the `'roomy'` items always mount a `description`-purpose tooltip (texts in spec §4.5). Settings' "Schedule
    settings" (a near name-echo) is replaced;
  - Resource view's icon becomes `ChartColumnStacked` (verified in `lucide-react` 1.49.0, `dist/lucide-react.d.ts:4306`),
    registered in `scripts/dependency-claims.json`;
  - `ToolbarButton.tsx`: delete the native `title` (`:105`) and the tooltip purpose derived from `!showLabel`
    (`:131`), leaving one tooltip path;
  - correct `selection-actions.tsx:934`, which cites `ICON_ONLY`.
- **Complexity:** L
- **Risks:**
  - A custom trigger made `'roomy'` without a tooltip: a structural test asserts every `'roomy'` item is a plain
    `onActivate` item rendered by `ToolbarButton`.
  - A label painted outside the helper: a structural test.
  - The container-query trap (`UX_STANDARDS.md:391-398`): satisfy `container-query.structural.test.ts`, plus a layout
    assertion that the deck's width equals the band's inner width at every cell.
- **Review:** accessibility-reviewer and component-reviewer **before release** (ADR-0111).
- **Changeset:** `@repo/web` minor.

---

### Milestone M2: Every tool on its subject's surface

> **M2 result (2026-10-09), recorded where the plan and the code disagreed** (`m2-measurement.md`).
> Built as listed, with these deviations: **View ▾ is Zoom plus the folded sections in one column and
> Insight overlays spanning two** (whole-section columns measured 593 px; the panel is 366 / 390 px at 1024 × 600),
> **the Gantt's Columns folds too**, and the Minimap's fieldset is renamed **Navigation** so the deck's
> "Panels" is the only group of that name. `ToolbarPopover` gained `description` (an icon-only trigger's
> tooltip) and `panelWidth`; `useMeasuredBox` re-measures an open overlay when it resizes. **Open for the
> owner:** labelling Apply levelled dates… costs coarse 1280 a DO line (3 lines after M4, not 2), and the cycling
> conflict read-out will still wrap LOOK at the floor by about 56 px after M4.

**Outcome:**

- an `identity` registry row (Plan summary, Edit plan details) rendered by `Toolbar` after the status badge;
- a Panels deck group (Legend, Resource view, Comments), trailing on LOOK;
- Plan trailing on DO;
- Float paths on the selection bar and Gantt row menu (**decided**, M0 §4.3);
- the View panel fitted at 1024 (three columns).

Two lines at the floor are **not** asserted at M2: zoom and minimap are still on the deck until M4. M2 records the
line count and LOOK's free width, including the **cycling** conflict read-out ("Conflict 2 of 7 · reason"), which
M0 did not measure. If that read-out makes LOOK miss at 1024 by under 20 px once M4's removal is projected, stop
and ask (spec §4.5 exit rule).

**Entry points:** header "Plan summary" and "Edit plan details"; LOOK group "Panels"; selection bar "Float paths";
Gantt row menu "Float paths"; "View" at 1024 × 600.
**Journey:**

- a header case: open and close Summary with focus returning, and the same for Edit plan details;
- Panels: `aria-pressed`, and focus never stranded on `body`;
- Float paths by keyboard in both views;
- View ▾ ≤ 420 px at 1024 × 600, every toggle reachable;
- the trailing edges at ≥ 1280;
- DOM order equals visual order.

##### M2-T1: the identity row (≈ one PR)

- **Description:** registry row `identity`, rendered by a `Toolbar` named "Plan details" (its own Tab stop) in the
  identity portal. Both items take taxonomy group `object`.
  - Summary: `aria-haspopup="dialog"`, `aria-expanded`, the name "Plan summary", a purpose tooltip, focus return.
  - Edit plan becomes "Edit plan details", gated on `model.canWrite`, with a purpose tooltip. The voice-command
    change goes in the changeset.
- **Complexity:** M
- **Testing:** `pen-status.spec.ts` (the header is one line at 1024).

##### M2-T2: the Panels group (≈ one PR)

- **Description:**
  - a `DECK_GROUPS` remap: Panels is `{ row: 'look', members: ['help'] }` (ADR-0031 group 7, now empty), and `help`
    is removed from Plan;
  - Legend, Resource view and Comments are registered in `help`. For Legend and Resource view this is the
    **migration of `LensToggle.promotion` to the generalised `PromotableEntry` with `at: 'always'`** (spec §4.11):
    `promotedLensItems`' hard-coded `group: 'lens'` and `atLeast` (`:437`, `:440`) become per-record. Baseline
    overlay keeps `group: 'lens'`;
  - the View fieldset id `'panels'` and the deck group "Panels" coexist until M4 deletes the fieldset. A one-line
    test asserts that `getByRole('group', { name: 'Panels' })` resolves to exactly one element with View ▾ open;
  - one `ml-auto` on Panels and one on Plan.
- **Complexity:** M
- **Testing:**
  - `command-surface.spec.ts` group membership gains "Panels";
  - a DOM-order equals visual-order assertion;
  - US-5 at ≥ 1280 when stacked.

##### M2-T3: the View panel at 1024 (≈ one PR)

- **Description:**
  - **three columns** (Zoom and Structure | Markers | Insight overlays and Colour), because two balanced columns
    measured about 633 px against SC-13's 420 (M0 §0.8);
  - **secondary sections collapsed by default** (Structure and Markers as disclosures, open state for one opening,
    ADR-0169), unless three columns alone measure ≤ 420, in which case the collapse is dropped;
  - measure at 1024 × 600 on both pointers and record it;
  - the `panels` `ViewToggleGroupId` fieldset stays until M4 removes Minimap (its sole occupant), then goes;
  - the zoom radios stay until C1 promotes them at M5.
- **Complexity:** M
- **Review:** accessibility-reviewer on the reading order and the disclosures.

##### M2-T4: Float paths to the selection bar and Gantt row menu (≈ one PR, decided)

- **Description:**
  - `SelectionActionContext` gains `floatPathsOpen` and `toggleFloatPaths` (today built only for
    `TsldToolbarContext`, `plan-workspace-toolbar.tsx:436`);
  - an object action in `selectionActionItems`, which `GanttRowMenu.tsx:147-153` already derives from, so the Gantt
    row menu mirrors it by construction;
  - the deck item is deleted.
- **Complexity:** M
- **Testing:**
  - `src/features/float-paths/float-paths-view-agnostic.structural.test.ts`;
  - `selection-duplication.structural.test.ts`;
  - `tsld-toolbar-float-paths.test.tsx`;
  - `e2e-float-paths/float-paths.spec.ts:66`, which locates `data-toolbar-item="float-paths"` in the LOOK row;
  - `e2e-health-check/health-check.spec.ts:139`.

  Correct `selection-actions.tsx:183-199` and the stale `:206`.

---

### Milestone M3: Below 1024, one scrolling line (#471; gate: CQ-3, narrow only)

> **M3 result (2026-10-09), recorded where the plan and the code disagreed** (`m3-measurement.md`). Built as listed, with:
> `squat` is `(width < 64rem) and (height <= 26rem)` (not `63.99rem`; 26 rem keeps the default 640 × 480 window held);
> the shell itself scrolls under `squat` (row 3 becomes `100dvh`) rather than the band moving inside `<main>`; the edge
> fade is a scroll-driven mask, with the half-clipped control as the fallback cue. **Unplanned:** at 320 the M2 "Plan
> details" toolbar pushed Edit plan details off the window (x = 322), so the app header's section 1 wraps below 26 rem
> (`xs`); that is why `<main>` starts at 239, not ≤ 200, at 320. **Open for the owner**, and not a stop: SC-5 holds at
> every cell. Three journeys that assumed a 700 × 900 or 640 × 844 window is a short body were re-sized to 740 px high.

**Outcome:** under `max-lg:` the deck is one line that scrolls sideways. Under `squat` (narrow **and** short) the
band scrolls away vertically. Wide windows are untouched: 1280 × 600 and 1366 × 768 keep two rows.
**Entry point:** the "Plan commands" toolbar at 640 × 360.
**Journey:** `e2e-narrow-shell/narrow-shell.spec.ts`:

- SC-5 at every #471 cell, **on both pointers**: the band is ≤ 40 % of height or scrolls away, and Expand and
  Recalculate (when stale) are hit-testable. **Coarse Expand is unreachable at all five cells today** (M0 §9), so
  the coarse half is the acceptance criterion this milestone exists for;
- SC-6;
- **text-only 200 % at 1280 × 800** (40 rem, so the scroll line applies). Today the band takes 88 % fine and 127 %
  coarse, and the foot row is unreachable on coarse (M0 §8). After M3, Expand is hit-testable on both pointers and
  the band is ≤ 40 % or scrolls away;
- after every arrow press, the focused control's rect is inside the scroller's visible rect;
- the overflow cue is visible;
- a menu opened from a half-scrolled trigger clamps to the viewport;
- 1280 × 600 still has two rows.

##### M3-T1 (≈ one PR)

- **Description:**
  - `flex-nowrap overflow-x-auto scroll-px-2` under `max-lg:`, with an edge fade;
  - **`scrollIntoView` on roving focus (required)**;
  - `@custom-variant squat` beside `tall`/`short` (`globals.css:31,36`), with its constant in `lib/breakpoints.ts`,
    pinned in `breakpoints.test.ts`. Its height is set in rem, so the 200 % text cell (25 rem tall at 1280 × 800)
    triggers it.
- **Complexity:** M
- **Review:** accessibility-reviewer **before release** (ADR-0111: `Deck`'s keyboard contract gains scrolling).
- **Changeset:** minor.

##### M3-T2 (same PR)

- Re-read the #471 cells. If the header's own wrap (88 / 136 px) still breaks SC-5 at 320, stop and ask.

---

### Milestone M4: The diagram-corner cluster (gate: CQ-1, decided yes)

> **M4 result (2026-10-10), recorded where the plan and the code disagreed** (`m4-measurement.md`). Built as listed, with:
> **the deck is two lines at 1024 × 600 on a mouse in every state measured** (LOOK 1, DO 1; the cycling read-out leaves LOOK
> 20.7 px spare) and `LINES[1024]` is `{ max: 2 }`; **the cycling read-out is count-only** (owner decision 2026-10-10, so the
> reason left the toolbar: it is announced in full, and the remedy stays on the selection bar; a sentence on the object is
> `docs/TECH_DEBT.md` #479 and needs a spec); **the axis-marker row is inside the ruler, not at the stage's bottom** (the
> column is bounded by the ruler and the resource strip); **no `aria-keyshortcuts`, because Zoom and Fit have no keyboard
> shortcut** to advertise; **`TsldCanvas` draws the column into a host `TsldPanel` places after the activity list**, so Tab is
> list, minimap, cluster; **Fit no longer closes a dock** (#480). SC-1's canvas is 362 px in every state without a selection
> bar and 246 with one (the bar's own foot row). `ToolbarRow` gained `'canvas'`; `Deck`, `Toolbar`, `Menu`, `ToolbarPopover`
> are untouched.

**Outcome:** a "Diagram viewport" toolbar (Zoom out, Zoom in, Fit to plan, Minimap) at the stage's bottom-right, with
the minimap stacking above it. Gone from the deck and from View ▾. **With M2 already landed, this is where the
two-line floor arrives** (M0 §3: LOOK 980.9 / 886.1 with Resource view compact, DO 967.7, canvas 362).
**Entry point:** the Diagram view's "Diagram viewport" toolbar, then "Zoom in".
**Journey:**

- **`command-surface.spec.ts`: `LINES[1024]` becomes `{ max: 2 }` fine** in the base, conflict ("1 conflict" and
  the cycling read-out), peer-pen, selection, dock, minimap, Gantt and empty-plan states; coarse 1024 stays
  `{ max: 4 }` (OD-2); a 1024 `BAND_MAX_PX` bar of about 139 fine (M0 §2);
- SC-1: canvas ≥ 350 at 1024 × 600 fine;
- press Zoom in and see the scale change;
- toggle Minimap (`aria-pressed`);
- Tab order canvas → minimap → cluster;
- shaded buttons are focusable and give their reason;
- switch to the Gantt: the cluster is absent, focus is handed to the view switch and announced (ADR-0135), and the
  band does not shift;
- **SC-15:** focus the bottom-right-most activity by keyboard and assert its rect intersects neither the cluster
  nor the minimap;
- with no room for the minimap, the toggle is shaded with its reason;
- a dock open, a selection present, the loading state, and Viewer and Contributor roles.

##### M4-T1: design note (ui-architect) and cluster (≈ one PR)

- **Description:**
  - registry row `canvas` in the same registry; Minimap reaches it as a `PromotableEntry` with `at: 'always'` and
    the `canvas` registry row;
  - **the context:** `TsldCanvas` publishes a positioned slot node for its bottom-right column (the
    `useChromeSlot` / `ChromePortal` pattern), and `plan-workspace-toolbar.tsx`, where `TsldToolbarContext` is built,
    portals the `Toolbar` into it, so the context is derived once;
  - `Toolbar` renders that slice; `toolbarCardVariants`; `aria-keyshortcuts` on each item;
  - geometry: the column sits **above the 14 px axis-marker row** (`tsld-axis-markers`) and **below the 40 px
    ruler**, and covers neither, including with C1 promoted (M5). There is no scrollbar in the stage (M0 §0.6). The
    reveal margin uses the column's live rect;
  - one positioned column, cluster fixed at the bottom and minimap above with `gap-2` (spec §4.7);
  - `minimapRoom` gains a **height clause** beside its width rule (`TsldCanvas.tsx:1602`): coarse 1024 × 600 leaves
    about 2 px (M0 §7), so the minimap withdraws there with its reason and the cluster stays. Both the coarse
    1024 × 600 cell and the 1024 dock-open cell (386 px stage) are journey-tested;
  - the reveal margin.
- **Complexity:** L
- **Review:** ui-architect note first; accessibility-reviewer **before release**; performance-reviewer
  (no canvas repaint).

##### M4-T2: remove the deck's frame section and View ▾'s Minimap row (≈ one PR)

- **Complexity:** S
- **Testing:** M0-T2.6's list of suites updated; re-read `LINES` and record the new free width.
- **Changeset:** minor.

---

### Milestone M5: Free space is used, the promotion ladder (gate: the product owner's requirement)

**Outcome:** at 1280, 1440, 1912 and 2560, on both pointers, the LOOK and DO deck rows and the corner cluster fill
their spare width with promoted menu commands in the spec's ladder order (§4.11). The search field grows at 2560.
Promoted entries leave their menus, and **no menu ever empties** (each has an anchor). The header has no ladder this
epic (D-b).
**Entry point:** the "Plan commands" toolbar at 1440 × 900 (fine). By M0's provisional stages, "Critical only",
"Health check", "Share…" and "Add: Start milestone" are on the bar there.
**Thresholds:** M0's stage table (spec §4.11) is the **provisional starting point**. M5 recomputes it from the JSON
re-taken after M4, with the worst-state reserve.
**Journey:** new `command-surface.spec.ts` cases per stage and pointer:

- SC-17: each deck row's unused width is ≤ 15 % or no remaining entry fits;
- SC-18 (a): at 3840 × 1440, every promoted form's width matches `promotion-widths.<pointer>.json` within 2 px;
- SC-18 (b): no unpromoted entry fits the free gap, **verified red** by raising one `at` (ADR-0110);
- each promoted item sits immediately after its source trigger, inside the same deck group, with group names
  unchanged;
- its source menu no longer lists it, and every source trigger is present at every stage;
- the roving order (ArrowRight, Home, End) matches visual order;
- **E-1:** promote while the source menu is open with focus on that entry: the menu closes and focus lands on the
  promoted button, announced;
- **E-2:** demote while focused on the promoted item: focus goes to the source trigger with "Moved into the ‹menu›
  menu.", also at 200 % text;
- **E-3:** the trigger is never removed as the window widens;
- Critical only and Filter ▾'s pressed state agree (both read `ctx.filterAttrs`);
- the dock toggles' `aria-pressed` follows a dock closed from its own close button;
- the kind presets arm their tool (Link, Add) exactly as the menu pick does, and are pen-gated with the same
  reason.

#### Feature: declared promotion

> **Complexity:** XL (it turns six menus' promotable entries into declared lists).
> **Dependencies:** M3 and M4 (the free widths depend on the settled layout); the M0 harness re-run after M4
> to produce the committed `promotion-widths.{fine,coarse}.json`.
> **Risks:**
>
> - A width mechanism returning, which is the ADR-0109 defect class. Mitigation: viewport stages only, committed
>   thresholds, monotonic by construction, and no command on today's bar ever demoted.
> - A capability lost in a menu refactor (Share was lost once, `tsld-toolbar-items.tsx:3357-3363`). Mitigation:
>   SC-19's manifest test, written **first**.
> - Two controls with one name: the menu omits promoted entries; asserted.

##### M5-T1: the manifest and the stage model, before any menu changes (≈ one PR, ships dark)

- **Description:**
  - `command-manifest.json`, produced by `pnpm --filter @repo/web manifest:commands`: every registry id, header
    control, selection-bar item and menu item name, each with its flag condition (`EARNED_VALUE_ENABLED`,
    `RESOURCE_CURVES_ENABLED`, …) and view scope (Diagram-only lenses);
  - `PROMOTE_80` / `_90` / `_119_5` / `_160` (rem) in `lib/breakpoints.ts`, pinned in `breakpoints.test.ts`;
  - `usePromotionStage()`, choosing the fine or coarse stage via `useCoarsePointer()`;
  - the pure `computePromotionStages`, with unit tests (skip-fill, monotonic, never takes an anchor);
  - `PromotableEntry` and `isPromoted`, generalising `LensToggle.promotion`. `defineToolbar` validates `from` and
    asserts every source menu has an anchor;
  - the structural test that a derived item is never `'roomy'` or `'never'`;
  - the assertion that the deck at the first stage is ≥ `--container-roomy` (79 rem), **per pointer, against that
    pointer's own first stage** (fine 80 rem; coarse LOOK 90 rem, M0 §10.3);
  - `computePromotionStages` **reserves the worst stress state per row** (a conflict on LOOK, a held pen on DO), with
    a unit test showing that L1 does not promote at fine 1280;
  - **the focus hand-off target**: `use-focus-handoff.ts` (and its test) gains a target hook, so demotion hands focus
    to the source trigger rather than the container (E-2). ADR-0111 review before release;
  - SC-19's **render-level** jsdom test (stubbed `matchMedia` and pointer, every source menu opened, bar xor menu),
    green against today;
  - SC-18 (c)'s unit test (`at` equals `computePromotionStages(json)`).
  - **Two M4 findings M5 must carry** (`m4-measurement.md` §8). **Legend and Minimap are always-promoted records**
    (`LensToggle` with no `group` and a `promotion`): they have no `View ▾` section, so the ladder must never
    treat one as demotable into a menu — there is nowhere for it to go. And `computePromotionStages` and
    `promotion-widths.json` **exclude the `canvas` row**: the cluster is staged on stage width at the diagram, not
    on the deck, and its four buttons are never promoted or demoted.

##### M5-T2 … T6: one menu per PR

In ladder order:

- Filter: L1 and L6; anchor Has constraint.
- Analysis: P1 and P6–P8; anchor Baselines….
- Share & export: P4 (Share…) only; anchor the export formats and Print…; Schedule (CSV) is not promoted.
- View: L2–L5, and C1 into the corner.
- Link and Add: P2, P3 and P5 as kind presets. Link promotes Finish-to-start, Start-to-start and Finish-to-finish
  only; **Start-to-finish is Link's unconditional anchor**, because "Stop linking" renders only while linking. Add's
  anchor is Task and Level of effort, since "Stop adding" is conditional too.

The structural test gains "anchor present when the tool is unarmed" for Link and Add, and "anchor renders
regardless of state and flags" for every menu. Each PR:

- declares that menu's promotable entries as `PromotableEntry` records (everything else in the menu stays JSX);
- renders the derived items: toggles, flat pressed sets named with their set ("Colour by: Total float"), and kind
  presets that arm their tool;
- omits promoted entries from the menu;
- adds a `lostReason` for each entry;
- updates the journeys and the manifest;
- changeset patch or minor.

The search-field growth at 2560 lands with the View PR.

**Test updates planned per PR (M0 §11).** Playwright's default viewport is 1280 × 720 = 80 rem, the first stage,
so once Analysis and Share & export promote, **default-viewport flows find Health check… and Share… on the bar, not
in the menu**:

- `e2e-health-check/health-check.spec.ts:38`, `:146`;
- `e2e-workspace-chrome/dock.spec.ts:295`;
- `activities-panel-scroll.spec.ts:648`;
- `e2e-interchange/interchange.spec.ts:117`;
- `e2e-share/share.spec.ts:55`, `:351`.

Each of these is changed in the PR that promotes its command, using a helper that reaches a command "on the bar or
in its menu" so the flow does not depend on the stage. Entries promoting only from 90–160 rem (Compare revisions,
Earned value, Late-start overlay, Has conflict) affect no default-viewport journey. They are listed for the
wide-viewport cases in `command-surface.spec.ts`.

##### M5-T7: re-measure (same as the last PR)

- The harness's SC-17 "after" table goes into `m0-measurement.md`'s appendix.

---

### Milestone M6: The visual brief (V1–V7)

**Outcome:** the decisions in spec §4.8. Each lands as its own commit with before and after screenshots at 1024 × 600,
1280 × 800, 1440 × 900 and 1912 × 1080, fine and coarse, signed off by the product owner (SC-16).
**Entry point:** the band on any plan. V5 is the header on every screen.
**Journey:** `command-surface.spec.ts` keeps SC-10, SC-12 and SC-17 green after each item.

- **V1** Row identity: a quiet leading row mark only. No stripes, no tint band, no new accent colour.
- **V2** Group pills, which also guard SC-12 (no leading seam).
- **V3** The shaded-control audit: ADR-0082 shading is kept; the treatment is quieter, with text ≥ 4.5:1 signed off
  by the accessibility-reviewer, and the Author group reads as one locked unit led by the pen.
- **V4** Share & export as the row's secondary-filled closing action, with Share… promoted beside it.
- **V4a** (optional, if cheap) Filter ▾ shows an active count or dot when attributes are on, derived from
  `ctx.filterAttrs`.
- **V5** The organisation switcher as a ghost button opening a menu (**CQ-4 decided**), to spec §4.12:
  - the visible current name;
  - the name "Active organisation: ‹Name›";
  - `menuitemradio` with `aria-checked`;
  - a single organisation shown as a plain label (ADR-0104);
  - hidden until organisations exist;
  - truncation with a tooltip;
  - `--control-h` sizing and a sizing token instead of `max-w-[12rem]`;
  - the unused `title` prop deleted;
  - **type-ahead added to `Menu`** under an ADR-0111 review before release, or the arrow/Home/End-only limit stated
    in the PR;
  - every consumer and test listed in spec §4.12 updated. The rationale it carries over is `OrgSwitcher.tsx:7-10`
    and `:33-36`.
- **V6** Covered by M2-T3.
- **V7** Balance, covered by M5.

---

### Milestone M7: Close-out (ships dark)

1. File **ADR-0184** from spec §4.10 (D1–D6). Add its line to `CLAUDE.md` §16. Add amendment notes to ADR-0031,
   ADR-0091 (D3), ADR-0100 and ADR-0179 (D2 use), and record the completion note on ADR-0090 D6 and ADR-0091 D3a.
2. **Remove `ToolbarItem.tier` and `ToolbarTier` (`docs/TECH_DEBT.md` #193).** Nothing reads them since
   ADR-0109 D1; M1 left the field declared and every registration still sets it. Delete the type, the field
   and the `tier:` lines, and sweep the prose that explains tier 3 as a live mechanism.
3. **Update `CLAUDE.md` §1's counts (`pnpm check:counts`)**: the ADR count, the web source file count, and any suite
   count.
4. `DESIGN_SYSTEM.md`: R1–R9, `--container-roomy` (derived from the first stage), the rem `PROMOTE_*` stages, the
   per-pointer widths, and the amended `:225` rule.
   `UX_STANDARDS.md`: R5 and R9.
5. `TECH_DEBT.md`: close #471's band half; a new row for its second paragraph (D-j); close #193 with the overturn
   noted.
6. The SC-14 and SC-19 manifest test green; the SC-17 before and after tables in the record.
7. Set the spec header to `Accepted — shipped (ADR-0184)` (`check:spec-status`).

## Reviewer checklists (each must be ticked in the PR, with `file:line` or a test name)

**Every milestone from M2 on, and close-out: the promotion checks.**

- [ ] **No spare width while something promotable sits in a menu**: SC-18 (a), (b) and (c) green at 1280, 1440,
      1912 and 2560 **on both pointers**, (b) verified red once.
- [ ] Unused width per deck row ≤ 15 %, or no remaining entry fits after the search field grows (SC-17). The table
      is attached.
- [ ] **Roving order and keyboard**: ArrowRight, Home and End visit promoted items in visual order. One Tab stop
      per toolbar. Group names (`View`, `Find`, `Panels`, `Author`, `Plan`) unchanged as items promote. No nested
      `role="group"` (flat pressed sets).
- [ ] A promoted item is absent from its menu, not shaded. No duplicate accessible names in the tree. **Every source
      trigger stays present at every stage** (anchors).
- [ ] Focus cases E-1, E-2 and E-3 journey-tested, E-2 also at 200 % text. Demotion hands focus to the source
      trigger with its `lostReason` (ADR-0135).
- [ ] Promoted items are labelled `'always'`; their tooltip names the source menu; flat-set names include the set.
- [ ] **The "no tool is lost" manifest (SC-14, SC-19) covers both states**: every entry resolves on the bar xor in
      its menu at every stage.

**Accessibility reviewer:**

- the M1 label API (names, tooltips, Escape, 2.5.3);
- M2's identity-row focus return and the Panels `aria-pressed`;
- M3's scroll focus and menu clamping;
- M4's Tab order, 2.4.11 and the Gantt hand-off;
- M5's promoted segments' names and the `segmentLabels` group;
- V5's organisation switcher.

All of these come **before release** where a shared primitive's keyboard contract changes (ADR-0111).

**Component reviewer:**

- the one resolver and helper (SC-8);
- the `'roomy'`-only-on-plain-buttons structural test;
- one registry, with no second registry for the cluster or the header;
- the declared-promotion API (one place, no thresholds in components);
- the `DECK_GROUPS` remap.

**UX reviewer:**

- the placement table against §4.6;
- the ladder order;
- the M6 screenshots;
- the < 20 px exit rule respected.

**Performance reviewer:**

- M1's container queries;
- M4's overlay (no canvas repaint);
- M5's `usePromotionStage` (media-query listeners only, with no width observer on the deck).

**Test engineer:** the journeys listed under each milestone.

## Sequencing & slices

M0 → M1 → M2. Then M3 (#471, moved ahead of the cluster), M4, M5, M6, M7.

- Every slice leaves `main` releasable: M1-T1 and M1-T2 are behaviour-neutral, M5-T1 ships dark, and each menu's
  promotion is its own commit.
- No flags. The rollback is reverting the commit.
- **Model switch points (§19.14):**
  - approval switches to Sonnet for M0 and M1;
  - switch to Opus if M0 contradicts a premise, for the M4 design note, and for M5's stage computation;
  - start a fresh session at the M5 boundary.

## Definition of Done (per task)

The Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md), with `pnpm prepush` and the changed
journeys run locally before pushing.

## Risks & assumptions (rollup)

| Risk                                                                                                                                                     | Likelihood | Impact | Mitigation                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| A row misses one line at 1024 in a stress state (the cycling conflict read-out is unmeasured; "1 conflict" leaves about 25.7 px with four compact items) | med        | med    | Measured at M2 and M4 before `LINES[1024] = 2` is asserted; < 20 px miss → stop and ask; no fifth compaction without the owner |
| The two-line floor claimed before it exists                                                                                                              | —          | high   | Resequenced: M1 asserts only label facts; two lines are first asserted at M4                                                   |
| Promotion stages drift after M2/M4 change the layout                                                                                                     | high       | low    | M0 stages are provisional; the JSON is re-taken after M4; SC-18 (a) and (c)                                                    |
| The promotion ladder brings back width-driven defects                                                                                                    | med        | high   | Viewport stages, committed thresholds, monotonic, never demotes today's bar; SC-18 verified red                                |
| A menu refactor loses a command                                                                                                                          | med        | high   | The SC-19 manifest test lands first (M5-T1)                                                                                    |
| Promoted widths differ from M0 after M3/M4                                                                                                               | high       | low    | Re-run the M0 harness before M5-T2                                                                                             |
| Gantt has no Float paths route                                                                                                                           | med        | low    | D-c is conditional                                                                                                             |
| Keyboard regressions in `Deck` scrolling, the cluster and the organisation menu                                                                          | med        | high   | ADR-0111 reviews before release; journeys                                                                                      |
| Text-only 200 % overflows rows                                                                                                                           | med        | low    | `flex-wrap` safety valve (R1), the SC-7 cell                                                                                   |
| The cluster covers activities                                                                                                                            | med        | low    | The SC-15 reveal margin and its journey                                                                                        |
| The organisation menu loses the native select's type-ahead                                                                                               | med        | med    | Add type-ahead to `Menu` under an ADR-0111 review, or state the limit (V5)                                                     |
| Promoted widths drift from the committed JSON                                                                                                            | med        | med    | SC-18 (a): CI re-measures at 3840 × 1440 on both pointers                                                                      |
| Demotion under focus at 200 % text                                                                                                                       | high       | med    | E-2's journey at 200 %; the source trigger is always present                                                                   |
